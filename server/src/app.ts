import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { stat, mkdir, readdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ServerConfig } from "./config.ts";
import { RoomManager } from "./rooms.ts";
import { attachWebSocketServer } from "./ws.ts";
import type { WebSocketLayer } from "./ws.ts";
import { streamReplayFile } from "./log/replay.ts";
import { errorMessage } from "./types.ts";
import type { Logger } from "./logger.ts";
import { Metrics } from "./metrics.ts";

export interface App {
  readonly server: Server;
  readonly roomManager: RoomManager;
  readonly metrics: Metrics;
  readonly ws: WebSocketLayer;
  listen(): Promise<{ port: number }>;
  /**
   * Graceful shutdown: readiness off → stop accepting (server.close) →
   * `shutdown` + close 1001 to every client → close rooms (flush match logs)
   * → resolve. The caller exits 0.
   */
  shutdown(signal: string): Promise<void>;
}

export async function createApp(
  config: ServerConfig,
  { logger, rootDir }: { readonly logger: Logger; readonly rootDir: string },
): Promise<App> {
  const clientDist = path.join(rootDir, "client", "dist");
  const logDir = path.resolve(rootDir, config.logDir);
  await mkdir(logDir, { recursive: true });
  const state = { ready: false, shuttingDown: false };
  const roomManager = new RoomManager(config, logger);
  const metrics = new Metrics(() => roomManager, config);
  const flakyAttempts = new Map<string, number>();
  if (config.bots > 0) {
    const botRoom = roomManager.get(config.botRoom);
    if (botRoom) {
      botRoom.addBots(config.bots);
      logger.info({
        event: "bots.added",
        roomId: botRoom.id,
        count: config.bots,
      });
    }
  }

  const MIME = new Map<string, string>([
    [".html", "text/html; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".css", "text/css; charset=utf-8"],
    [".json", "application/json; charset=utf-8"],
    [".png", "image/png"],
    [".webmanifest", "application/manifest+json"],
    [".jpg", "image/jpeg"],
    [".svg", "image/svg+xml"],
    [".wav", "audio/wav"],
    [".ico", "image/x-icon"],
  ]);

  function json(res: ServerResponse, statusCode: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(statusCode, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Length": Buffer.byteLength(payload),
    });
    res.end(payload);
  }

  class PayloadTooLargeError extends Error {}
  async function readBody(
    req: IncomingMessage,
    maxBytes: number,
  ): Promise<string> {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > maxBytes)
        throw new PayloadTooLargeError("request body too large");
      chunks.push(buffer);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  function isSafeRelativePath(pathname: string): boolean {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch (_error: unknown) {
      return false;
    }
    const normalized = decoded.replaceAll("\\", "/");
    return (
      !normalized.split("/").includes("..") && !normalized.startsWith("//")
    );
  }

  async function serveStatic(
    res: ServerResponse,
    pathname: string,
  ): Promise<void> {
    if (!isSafeRelativePath(pathname))
      return json(res, 400, { error: "invalid path" });
    let relative = decodeURIComponent(pathname);
    if (relative === "/") relative = "/index.html";
    const filePath = path.normalize(path.join(clientDist, relative));
    if (!filePath.startsWith(clientDist))
      return json(res, 400, { error: "invalid path" });
    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error("not a file");
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME.get(ext) ?? "application/octet-stream",
        "Cache-Control":
          ext === ".html" || relative === "/sw.js"
            ? "no-store"
            : "public, max-age=3600",
      });
      createReadStream(filePath).pipe(res);
    } catch (_error: unknown) {
      if (!path.extname(filePath)) return serveStatic(res, "/index.html");
      json(res, 404, { error: "not found" });
    }
  }

  const ArenaBodySchema = z
    .object({
      asteroidCount: z.number().int().optional(),
      homingEvery: z.number().int().optional(),
      asteroidSpeedMin: z.number().finite().optional(),
      asteroidSpeedMax: z.number().finite().optional(),
    })
    .optional();
  const RoomBodySchema = z.object({
    name: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(2).max(40)),
    capacity: z.number().int().min(1).optional(),
    arena: ArenaBodySchema,
  });
  function validateRoomBody(body: unknown) {
    const result = RoomBodySchema.safeParse(body);
    if (!result.success)
      throw new Error(
        result.error.issues.map((issue) => issue.message).join("; "),
      );
    const capacity = result.data.capacity ?? config.roomCapacity;
    if (capacity > config.roomCapacity) throw new Error("invalid capacity");
    const arena = result.data.arena ?? {};
    return {
      name: result.data.name,
      capacity,
      arena: {
        asteroidCount:
          arena.asteroidCount !== undefined
            ? Math.max(1, Math.min(30, arena.asteroidCount))
            : 8,
        homingEvery:
          arena.homingEvery !== undefined
            ? Math.max(1, Math.min(10, arena.homingEvery))
            : 4,
        asteroidSpeedMin:
          arena.asteroidSpeedMin !== undefined
            ? Math.max(0, arena.asteroidSpeedMin)
            : 30,
        asteroidSpeedMax:
          arena.asteroidSpeedMax !== undefined
            ? Math.max(10, arena.asteroidSpeedMax)
            : 80,
      },
    };
  }

  async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      const url = new URL(
        req.url ?? "/",
        `http://${config.host}:${config.port}`,
      );
      // Liveness: the process answers. Never depends on game state.
      if (req.method === "GET" && url.pathname === "/health") {
        return json(res, 200, {
          ok: true,
          version: config.version,
          gitSha: config.gitSha,
          uptime: process.uptime(),
          rssMb:
            Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100,
        });
      }
      // Readiness: can we take players right now?
      if (req.method === "GET" && url.pathname === "/ready") {
        const ready = state.ready && !state.shuttingDown;
        return json(res, ready ? 200 : 503, {
          ready,
          shuttingDown: state.shuttingDown,
          rooms: roomManager.list().length,
        });
      }
      if (req.method === "GET" && url.pathname === "/metrics") {
        const text = await metrics.registry.metrics();
        res.writeHead(200, {
          "Content-Type": metrics.registry.contentType,
          "Cache-Control": "no-store",
        });
        res.end(text);
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/rooms")
        return json(res, 200, { rooms: roomManager.list() });
      if (req.method === "GET" && url.pathname === "/api/stats")
        return json(res, 200, {
          version: config.version,
          gitSha: config.gitSha,
          connections: [...ws.connectionsByIp.values()].reduce(
            (t, n) => t + n,
            0,
          ),
          rates: metrics.rates(),
          rssMb: Math.round(process.memoryUsage().rss / 10485.76) / 100,
          rooms: roomManager.stats(),
        });

      if (req.method === "POST" && url.pathname === "/api/rooms") {
        try {
          const body: unknown = JSON.parse(await readBody(req, 16 * 1024));
          const input = validateRoomBody(body);
          const room = roomManager.create({ ...input, id: randomUUID() });
          return json(res, 201, {
            room: roomManager.list().find((item) => item.id === room.id),
          });
        } catch (error: unknown) {
          return json(res, error instanceof PayloadTooLargeError ? 413 : 400, {
            error: errorMessage(error),
          });
        }
      }

      const botsMatch = /^\/api\/rooms\/([^/]+)\/bots$/.exec(url.pathname);
      if (botsMatch && (req.method === "POST" || req.method === "DELETE")) {
        const room = roomManager.get(decodeURIComponent(botsMatch[1] ?? ""));
        if (!room) return json(res, 404, { error: "room not found" });
        if (req.method === "DELETE") {
          room.removeBots();
          return json(res, 200, { bots: room.botCount });
        }
        const count = Math.max(
          1,
          Math.min(32, Number(url.searchParams.get("count") ?? 1) || 1),
        );
        room.addBots(count);
        return json(res, 201, { bots: room.botCount });
      }

      if (req.method === "GET" && url.pathname === "/api/flaky") {
        const key = url.searchParams.get("key") ?? "default";
        const attempts = flakyAttempts.get(key) ?? 0;
        if (attempts < 2) {
          flakyAttempts.set(key, attempts + 1);
          return json(res, 503, { error: "temporary failure" });
        }
        flakyAttempts.delete(key);
        return json(res, 200, { attempts: attempts + 1, ok: true });
      }

      // Chaos-test hook (off by default): throws outside any try/catch so the
      // crash-on-unknown handler in index.ts is exercised end to end.
      if (
        config.debugCrashEndpoint &&
        req.method === "POST" &&
        url.pathname === "/api/debug/crash"
      ) {
        json(res, 202, { crashing: true });
        setImmediate(() => {
          throw new Error("deliberate crash for the chaos test");
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/slow") {
        const ms = Math.max(
          0,
          Math.min(5000, Number(url.searchParams.get("ms") ?? 300)),
        );
        const end = Date.now() + ms;
        while (Date.now() < end) {
          /* Deliberately blocking endpoint for the Lab 3 timing experiment. */
        }
        return json(res, 200, { ok: true, blockedMs: ms });
      }

      if (req.method === "GET" && url.pathname === "/api/replays") {
        const files = (await readdir(logDir))
          .filter((name) => name.endsWith(".ndjson"))
          .sort();
        return json(res, 200, { replays: files });
      }

      if (req.method === "GET" && url.pathname.startsWith("/api/replays/")) {
        const id = decodeURIComponent(
          url.pathname.slice("/api/replays/".length),
        );
        if (!/^[a-zA-Z0-9._-]+\.ndjson$/.test(id))
          return json(res, 400, { error: "invalid replay id" });
        const filePath = path.join(logDir, id);
        try {
          await stat(filePath);
        } catch (_error: unknown) {
          return json(res, 404, { error: "replay not found" });
        }
        res.writeHead(200, {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store",
        });
        return streamReplayFile(filePath, res);
      }

      if (req.method !== "GET" && req.method !== "HEAD")
        return json(res, 405, { error: "method not allowed" });
      return serveStatic(res, url.pathname);
    } catch (error: unknown) {
      logger.error(
        { event: "http.error", err: error, path: req.url },
        "request failed",
      );
      if (!res.headersSent) json(res, 500, { error: "internal server error" });
    }
  }

  const server = createServer((req, res) => {
    // Every request is handled to completion here; nothing is left floating.
    void handleRequest(req, res);
  });
  server.keepAliveTimeout = 65_000; // longer than typical proxy idle timeouts
  const ws = attachWebSocketServer(server, roomManager, config, {
    logger,
    metrics,
    isShuttingDown: () => state.shuttingDown,
  });

  let shutdownPromise: Promise<void> | null = null;
  return {
    server,
    roomManager,
    metrics,
    ws,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port, config.host, () => {
          const address = server.address();
          const port =
            typeof address === "object" && address ? address.port : config.port;
          state.ready = true;
          logger.info({
            event: "server.listening",
            host: config.host,
            port,
            version: config.version,
            gitSha: config.gitSha,
            nodeEnv: config.nodeEnv,
          });
          resolve({ port });
        });
      }),
    shutdown(signal: string): Promise<void> {
      shutdownPromise ??= (async () => {
        const started = Date.now();
        state.shuttingDown = true;
        logger.info({ event: "server.shutdown", signal });
        // 1. Stop accepting new HTTP/WS connections (in-flight requests finish).
        const httpClosed = new Promise<void>((resolve) =>
          server.close(() => resolve()),
        );
        server.closeIdleConnections();
        // 2. Players get a reason + 1001 and their client returns to the lobby.
        await ws.shutdown(Math.max(500, config.shutdownGraceMs / 2));
        // 3. Stop matches and flush the NDJSON match logs.
        await roomManager.closeAll();
        metrics.stop();
        server.closeAllConnections();
        await httpClosed;
        logger.info({ event: "server.stopped", ms: Date.now() - started });
      })();
      return shutdownPromise;
    },
  };
}

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { stat, mkdir, readdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import { WebSocketServer } from "ws";
import { loadConfig } from "./config.ts";
import { RoomManager } from "./rooms.ts";
import { attachWebSocketServer } from "./ws.ts";
import { streamReplayFile } from "./log/replay.ts";
import { errorMessage } from "./types.ts";

const config = loadConfig();
const rootDir = fileURLToPath(new URL("../../", import.meta.url));
const clientDist = path.join(rootDir, "client", "dist");
const logDir = path.resolve(rootDir, config.logDir);
await mkdir(logDir, { recursive: true });

const roomManager = new RoomManager(config);
const flakyAttempts = new Map<string, number>();
roomManager.on("error", (error) => console.error("[room-manager]", error));
if (config.bots > 0) {
  const botRoom = roomManager.get(config.botRoom);
  if (botRoom) {
    botRoom.addBots(config.bots);
    console.log(`[server] ${config.bots} bots in room ${botRoom.id}`);
  }
}

const MIME = new Map<string, string>([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
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
  return !normalized.split("/").includes("..") && !normalized.startsWith("//");
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
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600",
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

const server = createServer((req, res) => {
  // Every request is handled to completion here; nothing is left floating.
  void handleRequest(req, res);
});

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(req.url ?? "/", `http://${config.host}:${config.port}`);
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, {
        ok: true,
        uptime: process.uptime(),
        rooms: roomManager.list().length,
        rssMb:
          Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100,
      });
    }
    if (req.method === "GET" && url.pathname === "/api/rooms")
      return json(res, 200, { rooms: roomManager.list() });
    if (req.method === "GET" && url.pathname === "/api/stats")
      return json(res, 200, { rooms: roomManager.stats() });

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
      const id = decodeURIComponent(url.pathname.slice("/api/replays/".length));
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
    console.error("[http]", error);
    if (!res.headersSent) json(res, 500, { error: "internal server error" });
  }
}

const wss = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: config.maxPayload,
});
const stopHeartbeat = attachWebSocketServer(wss, roomManager, config);
server.listen(config.port, config.host, () => {
  console.log(`[server] http://${config.host}:${config.port}`);
  console.log(`[server] logs: ${logDir}`);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal}: shutting down`);
  stopHeartbeat();
  for (const socket of wss.clients) {
    socket.close(1001, "server shutdown");
    setTimeout(() => socket.terminate(), 500);
  }
  wss.close();
  await roomManager.closeAll();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  console.log("[server] shutdown complete");
  process.exitCode = 0;
}
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

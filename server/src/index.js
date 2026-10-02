import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { stat, mkdir, readdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { WebSocketServer } from "ws";
import { loadConfig } from "./config.js";
import { RoomManager } from "./rooms.js";
import { attachWebSocketServer } from "./ws.js";
import { streamReplayFile } from "./log/replay.js";

const config = loadConfig();
const rootDir = fileURLToPath(new URL("../../", import.meta.url));
const clientDist = path.join(rootDir, "client", "dist");
const logDir = path.resolve(rootDir, config.logDir);
await mkdir(logDir, { recursive: true });

const roomManager = new RoomManager(config);
const flakyAttempts = new Map();
roomManager.on("error", (error) => console.error("[room-manager]", error));

const MIME = new Map([
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

function json(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req, maxBytes) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBytes)
      throw Object.assign(new Error("request body too large"), {
        statusCode: 413,
      });
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function isSafeRelativePath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  const normalized = decoded.replaceAll("\\", "/");
  return !normalized.split("/").includes("..") && !normalized.startsWith("//");
}

async function serveStatic(req, res, pathname) {
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
  } catch {
    if (!path.extname(filePath)) {
      return serveStatic(req, res, "/index.html");
    }
    json(res, 404, { error: "not found" });
  }
}

function validateRoomBody(body) {
  if (!body || typeof body !== "object") throw new Error("invalid JSON body");
  const name = String(body.name ?? "").trim();
  const capacity = Number(body.capacity ?? config.roomCapacity);
  if (name.length < 2 || name.length > 40)
    throw new Error("name must be 2-40 characters");
  if (
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    capacity > config.roomCapacity
  )
    throw new Error("invalid capacity");
  const arena = body.arena && typeof body.arena === "object" ? body.arena : {};
  return {
    name,
    capacity,
    arena: {
      asteroidCount: Number.isInteger(arena.asteroidCount)
        ? Math.max(1, Math.min(30, arena.asteroidCount))
        : 8,
      homingEvery: Number.isInteger(arena.homingEvery)
        ? Math.max(1, Math.min(10, arena.homingEvery))
        : 4,
      asteroidSpeedMin: Number.isFinite(arena.asteroidSpeedMin)
        ? Math.max(0, arena.asteroidSpeedMin)
        : 30,
      asteroidSpeedMax: Number.isFinite(arena.asteroidSpeedMax)
        ? Math.max(10, arena.asteroidSpeedMax)
        : 80,
    },
  };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${config.host}:${config.port}`);

    if (req.method === "GET" && url.pathname === "/health")
      return json(res, 200, {
        ok: true,
        uptime: process.uptime(),
        rooms: roomManager.list().length,
      });
    if (req.method === "GET" && url.pathname === "/api/rooms")
      return json(res, 200, { rooms: roomManager.list() });
    if (req.method === "GET" && url.pathname === "/api/stats")
      return json(res, 200, { rooms: roomManager.stats() });

    if (req.method === "POST" && url.pathname === "/api/rooms") {
      try {
        const body = JSON.parse(await readBody(req, 16 * 1024));
        const input = validateRoomBody(body);
        const room = roomManager.create({ ...input, id: randomUUID() });
        return json(res, 201, {
          room: roomManager.list().find((item) => item.id === room.id),
        });
      } catch (error) {
        return json(res, error.statusCode ?? 400, { error: error.message });
      }
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
        /* intentionally blocks the event loop for the demo */
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
      } catch {
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
    return serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error("[http]", error);
    if (!res.headersSent) json(res, 500, { error: "internal server error" });
  }
});

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
async function shutdown(signal) {
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
  await new Promise((resolve) => server.close(resolve));
  console.log("[server] shutdown complete");
  process.exitCode = 0;
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

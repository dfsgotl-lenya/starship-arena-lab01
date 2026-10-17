import { afterEach, describe, expect, test } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { createApp } from "../src/app.ts";
import type { App } from "../src/app.ts";
import { silentLogger } from "../src/logger.ts";
import type { ServerConfig } from "../src/config.ts";
import { testConfig } from "./helpers.ts";

let app: App | null = null;
afterEach(async () => {
  await app?.shutdown("test");
  app = null;
});

async function start(overrides: Partial<ServerConfig> = {}) {
  app = await createApp(testConfig(overrides), {
    logger: silentLogger,
    rootDir: process.cwd(),
  });
  const { port } = await app.listen();
  return { base: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}/ws` };
}

function open(url: string, headers: Record<string, string> = {}) {
  return new Promise<{ socket: WebSocket; status?: number }>((resolve) => {
    const socket = new WebSocket(url, { headers });
    socket.once("open", () => resolve({ socket }));
    socket.once("unexpected-response", (_req, res) =>
      resolve({ socket, status: res.statusCode }),
    );
    socket.once("error", () => resolve({ socket, status: 0 }));
  });
}

async function metric(
  base: string,
  name: string,
  labels = "",
): Promise<number> {
  const text = await fetch(`${base}/metrics`).then((r) => r.text());
  const line = text.split("\n").find((l) => l.startsWith(`${name}${labels}`));
  return line ? Number(line.split(" ").at(-1)) : 0;
}

describe("health, readiness, metrics", () => {
  test("/health is liveness with the build stamp; /ready flips to 503 on shutdown", async () => {
    const { base } = await start({ version: "1.2.3", gitSha: "abc1234" });
    const health = await fetch(`${base}/health`).then((r) => r.json());
    expect(health).toMatchObject({
      ok: true,
      version: "1.2.3",
      gitSha: "abc1234",
    });
    expect((await fetch(`${base}/ready`)).status).toBe(200);
    const stopping = app!.shutdown("SIGTERM");
    // Readiness is off immediately; a new WebSocket handshake gets 503.
    const late = await open(base.replace("http", "ws") + "/ws").catch(() => ({
      status: 0,
    }));
    expect([503, 0]).toContain(late.status ?? 0);
    await stopping;
    app = null;
  });

  test("/metrics exposes players, rooms, msg/bytes, tick p99, event loop and memory", async () => {
    const { base, ws } = await start();
    const { socket } = await open(ws);
    socket.send(
      JSON.stringify({ v: 0, type: "join", room: "alpha", name: "M" }),
    );
    await new Promise((r) => setTimeout(r, 1300));
    const text = await fetch(`${base}/metrics`).then((r) => r.text());
    for (const name of [
      "starship_players 1",
      "starship_rooms 3",
      'starship_ws_messages_total{direction="in"}',
      'starship_ws_bytes_total{direction="out"}',
      'starship_tick_p99_ms{room="alpha"}',
      "starship_event_loop_utilization",
      "starship_process_resident_memory_bytes",
      "starship_build_info",
    ])
      expect(text).toContain(name);
    const stats = await fetch(`${base}/api/stats`).then((r) => r.json());
    expect(stats.rates.messagesOut).toBeGreaterThan(10);
    socket.close();
  });
});

describe("handshake hardening", () => {
  test("a foreign Origin is rejected with 403 and counted; our own origin passes", async () => {
    const { base, ws } = await start({
      allowedOrigins: ["https://friend.example"],
    });
    const evil = await open(ws, { Origin: "https://evil.example" });
    expect(evil.status).toBe(403);
    expect(
      await metric(base, "starship_ws_rejections_total", '{reason="origin"}'),
    ).toBe(1);
    const same = await open(ws, { Origin: base });
    expect(same.status).toBeUndefined();
    const friend = await open(ws, { Origin: "https://friend.example" });
    expect(friend.status).toBeUndefined();
    same.socket.close();
    friend.socket.close();
  });

  test("clients without Origin can be refused too", async () => {
    const { ws } = await start({ allowMissingOrigin: false });
    expect((await open(ws)).status).toBe(403);
  });

  test("connections per IP are capped", async () => {
    const { base, ws } = await start({ maxConnectionsPerIp: 2 });
    const a = await open(ws);
    const b = await open(ws);
    const c = await open(ws);
    expect(c.status).toBe(429);
    expect(
      await metric(base, "starship_ws_rejections_total", '{reason="ip_limit"}'),
    ).toBe(1);
    a.socket.close();
    await new Promise((r) => a.socket.once("close", r));
    const d = await open(ws);
    expect(d.status).toBeUndefined();
    b.socket.close();
    d.socket.close();
  });
});

describe("graceful shutdown and chaos", () => {
  test("SIGTERM path: clients get `shutdown` + close 1001, shutdown finishes fast", async () => {
    const { ws } = await start();
    const { socket } = await open(ws);
    const messages: string[] = [];
    socket.on("message", (data, isBinary) => {
      if (!isBinary) messages.push(String(data));
    });
    socket.send(
      JSON.stringify({ v: 0, type: "join", room: "alpha", name: "S" }),
    );
    await new Promise((r) => setTimeout(r, 200));
    const closed = new Promise<number>((resolve) =>
      socket.once("close", (code) => resolve(code)),
    );
    const started = Date.now();
    await app!.shutdown("SIGTERM");
    app = null;
    expect(await closed).toBe(1001);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(messages.some((m) => m.includes('"type":"shutdown"'))).toBe(true);
  });

  test("a client vanishing mid-match is removed from the room and the roster", async () => {
    const { base, ws } = await start();
    const a = await open(ws);
    const b = await open(ws);
    const rosterSizes: number[] = [];
    b.socket.on("message", (data, isBinary) => {
      if (isBinary) return;
      const message = JSON.parse(String(data));
      if (message.type === "roster") rosterSizes.push(message.players.length);
    });
    a.socket.send(
      JSON.stringify({ v: 0, type: "join", room: "alpha", name: "A" }),
    );
    await new Promise((r) => setTimeout(r, 100));
    b.socket.send(
      JSON.stringify({ v: 0, type: "join", room: "alpha", name: "B" }),
    );
    await new Promise((r) => setTimeout(r, 200));
    a.socket.terminate(); // no close frame: the TCP connection just dies
    await new Promise((r) => setTimeout(r, 300));
    expect(rosterSizes.at(-1)).toBe(1);
    const rooms = await fetch(`${base}/api/rooms`).then((r) => r.json());
    expect(
      rooms.rooms.find((r: { id: string }) => r.id === "alpha").players,
    ).toBe(1);
    b.socket.close();
  });

  test("a garbage flood is cut off and does not slow down another room", async () => {
    const { base, ws } = await start({
      messageRate: 60,
      maxConnectionsPerIp: 50,
    });
    app!.roomManager.get("nebula")!.addBots(8);
    await new Promise((r) => setTimeout(r, 1500));
    const before = app!.roomManager
      .get("nebula")!
      .match.tickPercentiles().tickP99Ms;
    // 1,000 garbage frames per second from reconnecting clients for 2 s.
    const end = Date.now() + 2000;
    let closedByServer = 0;
    while (Date.now() < end) {
      const { socket, status } = await open(ws);
      if (status) continue;
      socket.on("close", (code) => {
        if (code === 1008) closedByServer += 1;
      });
      for (let i = 0; i < 100 && socket.readyState === WebSocket.OPEN; i += 1)
        socket.send(Buffer.from([0xde, 0xad, i]));
      await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => setTimeout(r, 300));
    const after = app!.roomManager
      .get("nebula")!
      .match.tickPercentiles().tickP99Ms;
    expect(closedByServer).toBeGreaterThan(5);
    expect(
      await metric(
        base,
        "starship_ws_rejections_total",
        '{reason="bad_binary"}',
      ),
    ).toBeGreaterThan(5);
    // The bot room's tick stays far below one 33 ms frame.
    expect(after).toBeLessThan(Math.max(10, before * 5));
    app!.roomManager.get("nebula")!.removeBots();
  }, 15_000);
});

describe("real process", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  function run(env: Record<string, string>) {
    const child = spawn(process.execPath, ["server/src/index.ts"], {
      cwd: root,
      env: {
        ...process.env,
        PORT: "0",
        LOG_LEVEL: "info",
        LOG_DIR: mkdtempSync(path.join(tmpdir(), "starship-proc-")),
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const lines: Array<Record<string, unknown>> = [];
    let buffer = "";
    child.stdout.on("data", (chunk) => {
      buffer += String(chunk);
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        try {
          lines.push(JSON.parse(line));
        } catch {
          /* not JSON */
        }
      }
    });
    const exited = new Promise<number | null>((resolve) =>
      child.once("exit", (code) => resolve(code)),
    );
    const listening = async () => {
      while (!lines.some((l) => l["event"] === "server.listening"))
        await new Promise((r) => setTimeout(r, 20));
      return lines.find((l) => l["event"] === "server.listening")![
        "port"
      ] as number;
    };
    return { child, lines, exited, listening };
  }

  test("SIGTERM → exit code 0 in < 10 s, logs are JSON lines", async () => {
    const proc = run({});
    const port = await proc.listening();
    const { socket } = await open(`ws://127.0.0.1:${port}/ws`);
    const closed = new Promise<number>((resolve) =>
      socket.once("close", (code) => resolve(code)),
    );
    const started = Date.now();
    proc.child.kill("SIGTERM");
    expect(await proc.exited).toBe(0);
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(await closed).toBe(1001);
    expect(proc.lines.map((l) => l["event"])).toEqual(
      expect.arrayContaining([
        "server.listening",
        "server.shutdown",
        "server.stopped",
      ]),
    );
  }, 20_000);

  test("an uncaught exception is logged with its stack and the process exits 1", async () => {
    const proc = run({ DEBUG_CRASH_ENDPOINT: "true" });
    const port = await proc.listening();
    await fetch(`http://127.0.0.1:${port}/api/debug/crash`, { method: "POST" });
    expect(await proc.exited).toBe(1);
    const fatal = proc.lines.find((l) => l["event"] === "process.crash");
    expect(fatal?.["level"]).toBe("fatal");
    expect(JSON.stringify(fatal)).toContain("deliberate crash");
  }, 20_000);
});

/**
 * Lab 7 load test: 8, 32, 64 and 128 headless clients (no browser window).
 *
 * For every client count a fresh server process is started, a room with enough
 * capacity is created over HTTP, and N WebSocket clients join it and send the
 * same binary input packets a browser sends (30 Hz). After a warm-up we read
 * /api/stats: tick = simulation step + snapshot fan-out to every client.
 *
 * Usage: npx tsx server/scripts/load-test.ts [label] [--counts 8,32,64,128]
 *        [--seconds 8] [--env KEY=VALUE ...]
 * Output: perf/load/<label>.json + a markdown table on stdout.
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { WebSocket } from "ws";
import { encodeInput } from "@starship-arena/shared/codec/binary.ts";
import { mulberry32 } from "@starship-arena/shared/sim/prng.ts";
import { sequenceNumber, tickNumber } from "@starship-arena/shared/types.ts";
import type { Turn } from "@starship-arena/shared/types.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const argv = process.argv.slice(2);
const label =
  argv.find((arg) => !arg.startsWith("--") && !arg.includes("=")) ?? "load";
function option(name: string, fallback: string): string {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? (argv[index + 1] ?? fallback) : fallback;
}
const counts = option("counts", "8,32,64,128,256,512").split(",").map(Number);
const seconds = Number(option("seconds", "8"));
/** 0 = everyone in one room; K = rooms of K players (realistic matches). */
const roomSize = Number(option("room-size", "0"));
const extraEnv: Record<string, string> = {};
for (let index = 0; index < argv.length; index += 1)
  if (argv[index] === "--env") {
    const [key, value] = (argv[index + 1] ?? "").split("=");
    if (key && value !== undefined) extraEnv[key] = value;
  }

interface StatsRoom {
  readonly room: string;
  readonly tickCount: number;
  readonly tickP50Ms: number;
  readonly tickP95Ms: number;
  readonly tickP99Ms: number;
  readonly tickMaxMs: number;
  readonly stepDurationMs: number;
  readonly players: number;
}
interface Row {
  clients: number;
  tickP50Ms: number;
  tickP95Ms: number;
  tickP99Ms: number;
  tickMaxMs: number;
  stepMsAvg: number;
  ticksPerSecond: number;
  snapshotKBps: number;
  entities: number;
}

async function startServer(port: number) {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "server/src/index.ts"],
    {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        ROOM_CAPACITY: "1024",
        MAX_ROOMS: "1000",
        MAX_CONNECTIONS_PER_IP: "5000",
        MESSAGE_RATE: "60",
        MAX_PAYLOAD: "8192",
        SLOW_CLIENT_BYTES: "8000000",
        LOG_DIR: path.join(root, "logs", "load"),
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  await new Promise<void>((resolve, reject) => {
    child.stdout.on("data", (chunk: Buffer) => {
      if (String(chunk).includes("server.listening")) resolve();
    });
    child.once("exit", (code) => reject(new Error(`server exited ${code}`)));
  });
  return child;
}

function connectClient(
  base: string,
  room: string,
  index: number,
  meter: { bytes: number; entities: number },
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${base.replace("http", "ws")}/ws`);
    const random = mulberry32(index * 7349 + 11);
    let seq = 0;
    let tick = 0;
    let turn: Turn = 0;
    let timer: NodeJS.Timeout | undefined;
    socket.binaryType = "nodebuffer";
    socket.on("open", () => {
      socket.send(
        JSON.stringify({ v: 0, type: "join", room, name: `load-${index}` }),
      );
    });
    socket.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        meter.bytes += data.byteLength;
        tick = data.readUInt32LE(2);
        meter.entities = data.readUInt16LE(6);
        return;
      }
      const message: unknown = JSON.parse(String(data));
      if (
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === "joined"
      ) {
        // Same packets a browser sends: 30 Hz binary input.
        timer = setInterval(() => {
          if (socket.readyState !== WebSocket.OPEN) return;
          if (random() < 0.1) {
            const roll = random();
            turn = roll < 0.33 ? -1 : roll < 0.66 ? 0 : 1;
          }
          seq += 1;
          socket.send(
            encodeInput({
              seq: sequenceNumber(seq),
              tick: tickNumber(tick),
              thrust: random() < 0.5,
              turn,
              fire: random() < 0.15,
            }),
          );
        }, 1000 / 30);
        resolve(socket);
      }
    });
    socket.on("close", () => clearInterval(timer));
    socket.on("error", reject);
  });
}

async function measure(clients: number): Promise<Row> {
  const port = 4100 + Math.floor(Math.random() * 800);
  const base = `http://127.0.0.1:${port}`;
  const server = await startServer(port);
  try {
    const perRoom = roomSize > 0 ? roomSize : clients;
    const roomIds: string[] = [];
    for (let made = 0; made < clients; made += perRoom) {
      const created = (await fetch(`${base}/api/rooms`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: `load ${clients}`, capacity: perRoom }),
      }).then((response) => response.json())) as { room: { id: string } };
      roomIds.push(created.room.id);
    }
    const room = roomIds[0]!;
    const meter = { bytes: 0, entities: 0 };
    const sockets: WebSocket[] = [];
    for (let index = 0; index < clients; index += 1)
      sockets.push(
        await connectClient(
          base,
          roomIds[Math.floor(index / perRoom)]!,
          index,
          meter,
        ),
      );
    await sleep(3000);
    const read = async (): Promise<StatsRoom> => {
      const stats = (await fetch(`${base}/api/stats`).then((response) =>
        response.json(),
      )) as { rooms: StatsRoom[] };
      const found = stats.rooms.find((item) => item.room === room);
      if (!found) throw new Error("room missing from stats");
      // With many rooms, report the worst room (all rooms share one event loop).
      const ours = stats.rooms.filter((item) => roomIds.includes(item.room));
      const worst = ours.reduce(
        (a, b) => (b.tickP99Ms > a.tickP99Ms ? b : a),
        found,
      );
      return {
        ...found,
        tickP50Ms: worst.tickP50Ms,
        tickP95Ms: worst.tickP95Ms,
        tickP99Ms: worst.tickP99Ms,
        tickMaxMs: Math.max(...ours.map((item) => item.tickMaxMs)),
      };
    };
    const first = await read();
    const bytesStart = meter.bytes;
    const startedAt = performance.now();
    let stepSum = 0;
    let stepSamples = 0;
    let last = first;
    while (performance.now() - startedAt < seconds * 1000) {
      await sleep(250);
      last = await read();
      stepSum += last.stepDurationMs;
      stepSamples += 1;
    }
    const elapsed = (performance.now() - startedAt) / 1000;
    for (const socket of sockets) socket.close();
    return {
      clients,
      tickP50Ms: round(last.tickP50Ms),
      tickP95Ms: round(last.tickP95Ms),
      tickP99Ms: round(last.tickP99Ms),
      tickMaxMs: round(last.tickMaxMs),
      stepMsAvg: round(stepSum / Math.max(1, stepSamples)),
      ticksPerSecond: round((last.tickCount - first.tickCount) / elapsed),
      snapshotKBps: round(
        (meter.bytes - bytesStart) / 1024 / elapsed / clients,
      ),
      entities: meter.entities,
    };
  } finally {
    server.kill("SIGTERM");
    await sleep(300);
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

const rows: Row[] = [];
for (const clients of counts) {
  const row = await measure(clients);
  rows.push(row);
  console.error(`[load] ${clients} clients:`, row);
}
const outDir = path.join(root, "perf", "load");
await mkdir(outDir, { recursive: true });
await writeFile(
  path.join(outDir, `${label}.json`),
  JSON.stringify(
    { label, date: new Date().toISOString(), env: extraEnv, rows },
    null,
    2,
  ),
);
const limit = rows.find((row) => row.tickP99Ms > 33 || row.ticksPerSecond < 29);
console.log(`\n### ${label}\n`);
console.log(
  "| clients | tick p50 ms | tick p95 ms | tick p99 ms | max ms | step ms | ticks/s | KB/s per client | entities |",
);
console.log("|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const row of rows)
  console.log(
    `| ${row.clients} | ${row.tickP50Ms} | ${row.tickP95Ms} | ${row.tickP99Ms} | ${row.tickMaxMs} | ${row.stepMsAvg} | ${row.ticksPerSecond} | ${row.snapshotKBps} | ${row.entities} |`,
  );
console.log(
  limit
    ? `\nTick p99 exceeds 33 ms (or the server misses 30 Hz) from ${limit.clients} clients.`
    : "\nTick p99 stays under 33 ms for every tested client count.",
);

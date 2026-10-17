/**
 * Lab 8 chaos test with numbers for the README.
 *
 *  1. Room "alpha" plays with 8 bots; we record its tick p99 for 5 s.
 *  2. A hostile client (2 connections in parallel) sends ~1,000+ garbage binary frames per second for 10 s
 *     (it reconnects every time the server cuts it off) into room "nebula".
 *  3. We record alpha's tick p99 again, the rejection counters and the
 *     event-loop utilization from /metrics.
 *
 * Usage: node server/scripts/chaos.ts
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { WebSocket } from "ws";

const PORT = 3330;
const base = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ["server/src/index.ts"], {
  env: {
    ...process.env,
    PORT: String(PORT),
    BOTS: "8",
    BOT_ROOM: "alpha",
    LOG_LEVEL: "error",
    MAX_CONNECTIONS_PER_IP: "64",
  },
  stdio: ["ignore", "inherit", "inherit"],
});
process.on("exit", () => server.kill("SIGTERM"));
while (
  !(await fetch(`${base}/ready`)
    .then((r) => r.ok)
    .catch(() => false))
)
  await sleep(100);

interface RoomStats {
  room: string;
  tickP99Ms: number;
  tickP50Ms: number;
  players: number;
}
async function alpha(): Promise<RoomStats> {
  const stats = (await fetch(`${base}/api/stats`).then((r) => r.json())) as {
    rooms: RoomStats[];
  };
  return stats.rooms.find((r) => r.room === "alpha")!;
}
async function metric(name: string): Promise<string[]> {
  const text = await fetch(`${base}/metrics`).then((r) => r.text());
  return text.split("\n").filter((line) => line.startsWith(name));
}

await sleep(11_000); // fill the 300-tick window
const before = await alpha();
const eluBefore = await metric("starship_event_loop_utilization ");

let sent = 0;
let cutOff = 0;
const floodUntil = Date.now() + 10_000;
async function hostile(): Promise<void> {
  while (Date.now() < floodUntil) {
    const socket = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    await new Promise<void>((resolve) => {
      socket.on("open", () => {
        socket.send(
          JSON.stringify({
            v: 0,
            type: "join",
            room: "nebula",
            name: "griefer",
          }),
        );
        const timer = setInterval(() => {
          for (
            let i = 0;
            i < 10 && socket.readyState === WebSocket.OPEN;
            i += 1
          ) {
            socket.send(Buffer.from([0xff, 0x00, i, 0x13, 0x37]));
            sent += 1;
          }
        }, 10); // 10 frames / 10 ms ≈ 1,000 frames/s
        socket.on("close", (code) => {
          clearInterval(timer);
          if (code === 1008) cutOff += 1;
          resolve();
        });
      });
      socket.on("error", () => resolve());
    });
  }
}
await Promise.all([hostile(), hostile()]);
await sleep(500);
const during = await alpha();
const eluDuring = await metric("starship_event_loop_utilization ");
const rejections = await metric("starship_ws_rejections_total");

console.log(
  "### Chaos: garbage flood into room nebula, bots playing in alpha\n",
);
console.log("| | alpha tick p50 | alpha tick p99 | event-loop utilization |");
console.log("|---|---:|---:|---:|");
console.log(
  `| before flood | ${before.tickP50Ms.toFixed(2)} ms | ${before.tickP99Ms.toFixed(2)} ms | ${eluBefore[0]?.split(" ")[1]} |`,
);
console.log(
  `| during flood (last 10 s) | ${during.tickP50Ms.toFixed(2)} ms | ${during.tickP99Ms.toFixed(2)} ms | ${eluDuring[0]?.split(" ")[1]} |`,
);
console.log(
  `\ngarbage frames sent: ${sent} in 10 s (≈ ${Math.round(sent / 10)}/s); connections cut off with 1008: ${cutOff}`,
);
console.log("\n```text\n" + rejections.join("\n") + "\n```");
server.kill("SIGTERM");

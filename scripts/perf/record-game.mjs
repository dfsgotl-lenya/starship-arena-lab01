#!/usr/bin/env node
/**
 * Lab 7 — 30-second recording of a game with 8 server bots.
 *
 * Pass 1 (clean): frame work time + frame interval p50/p95/p99 from
 *   `window.__perf`, GC pauses from a Chrome trace (MinorGC/MajorGC events),
 *   JS heap size every 100 ms, server tick stats from /api/stats.
 * Pass 2 (profiling): CPU profile (flame chart) + sampling heap profiler that
 *   also counts objects already collected by GC ⇒ "who allocates the most".
 *
 * Usage: node scripts/perf/record-game.mjs <label> [--seconds 30] [--bots 8]
 * Requires `npm run build` first (the server serves client/dist).
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const args = process.argv.slice(2);
const label = args.find((arg) => !arg.startsWith("--")) ?? "run";
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const seconds = Number(option("seconds", "30"));
const bots = Number(option("bots", "8"));
const query = option("query", "");
const port = 3200 + Math.floor(Math.random() * 500);
const outDir = path.join(root, "perf", "results", label);
await mkdir(outDir, { recursive: true });

const server = spawn(
  process.execPath,
  ["--import", "tsx", "server/src/index.ts"],
  {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      BOTS: String(bots),
      BOT_ROOM: "alpha",
      MESSAGE_RATE: "60",
      LOG_DIR: path.join(outDir, "logs"),
    },
    stdio: ["ignore", "pipe", "inherit"],
  },
);
process.on("exit", () => server.kill("SIGTERM"));
await new Promise((resolve, reject) => {
  server.stdout.on("data", (chunk) => {
    if (String(chunk).includes("[server] http")) resolve();
  });
  server.once("exit", (code) => reject(new Error(`server exited ${code}`)));
});

const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({
  args: ["--enable-precise-memory-info", "--disable-renderer-backgrounding"],
});

async function openGame() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  await page.goto(`${base}/?perf=1${query ? `&${query}` : ""}`);
  await page.waitForSelector("#join-room:not([disabled])");
  await page.click("#join-room");
  await page.waitForSelector("#chat-panel:not([hidden])");
  await page.click("#canvas-wrap");
  // A human-like pilot: thrust + turn held, fire every 250 ms.
  await page.keyboard.down("KeyW");
  await page.keyboard.down("KeyD");
  const fireTimer = setInterval(() => {
    void page.keyboard.press("Space").catch(() => undefined);
  }, 250);
  return { context, page, stop: () => clearInterval(fireTimer) };
}

async function collectTrace(cdp) {
  const events = [];
  cdp.on("Tracing.dataCollected", ({ value }) => events.push(...value));
  const done = new Promise((resolve) =>
    cdp.once("Tracing.tracingComplete", resolve),
  );
  await cdp.send("Tracing.end");
  await done;
  return events;
}

// ---------- Pass 1: clean frame timings + GC ----------
console.error("[perf] pass 1");
const clean = await openGame();
console.error("[perf] joined");
await sleep(3000); // warm-up: JIT tiers, sprite decode
const cdp1 = await clean.context.newCDPSession(clean.page);
await cdp1.send("Tracing.start", {
  transferMode: "ReportEvents",
  traceConfig: {
    includedCategories: ["devtools.timeline", "v8", "disabled-by-default-v8.gc"],
    recordMode: "recordContinuously",
  },
});
await clean.page.evaluate(() => window.__perf?.start());
const heap = [];
const serverTicks = [];
const startedAt = Date.now();
while (Date.now() - startedAt < seconds * 1000) {
  const sample = await clean.page.evaluate(() => ({
    t: performance.now(),
    // performance.memory is Chrome-only and not in the DOM typings.
    used: performance.memory?.usedJSHeapSize ?? 0,
    entities: window.__perf?.entities() ?? 0,
  }));
  heap.push(sample);
  if (heap.length % 10 === 0) {
    const stats = await fetch(`${base}/api/stats`).then((r) => r.json());
    const alpha = stats.rooms.find((room) => room.room === "alpha");
    if (alpha) serverTicks.push(alpha);
  }
  await sleep(100);
}
const frames = await clean.page.evaluate(() => window.__perf?.stop());
console.error("[perf] collecting trace");
const trace = await collectTrace(cdp1);
console.error("[perf] trace events", trace.length);
clean.stop();
await clean.context.close();

const rendererPid = (() => {
  const counts = new Map();
  for (const event of trace)
    if (event.name === "FunctionCall" || event.name === "FireAnimationFrame")
      counts.set(event.pid, (counts.get(event.pid) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
})();
const gcEvents = trace.filter(
  (event) =>
    event.pid === rendererPid &&
    event.ph === "X" &&
    (event.name === "MinorGC" || event.name === "MajorGC"),
);
const gc = { minor: summarizeGc(gcEvents, "MinorGC"), major: summarizeGc(gcEvents, "MajorGC") };

// ---------- Pass 2: CPU + allocation profile ----------
console.error("[perf] pass 2");
const prof = await openGame();
await sleep(3000);
const cdp2 = await prof.context.newCDPSession(prof.page);
await cdp2.send("Profiler.enable");
await cdp2.send("Profiler.setSamplingInterval", { interval: 200 });
await cdp2.send("HeapProfiler.enable");
await cdp2.send("HeapProfiler.startSampling", {
  samplingInterval: 4096,
  includeObjectsCollectedByMajorGC: true,
  includeObjectsCollectedByMinorGC: true,
});
await cdp2.send("Profiler.start");
await sleep(seconds * 1000);
const { profile: cpuProfile } = await cdp2.send("Profiler.stop");
const { profile: heapProfile } = await cdp2.send("HeapProfiler.stopSampling");
prof.stop();
await prof.context.close();
await browser.close();
server.kill("SIGTERM");

const allocators = topAllocators(heapProfile, seconds);
const hot = topSelfTime(cpuProfile);
const summary = {
  label,
  seconds,
  bots,
  date: new Date().toISOString(),
  chromium: browser.version(),
  frames,
  gc,
  heap: {
    minMb: Math.min(...heap.map((s) => s.used)) / 1048576,
    maxMb: Math.max(...heap.map((s) => s.used)) / 1048576,
    avgEntities: heap.reduce((t, s) => t + s.entities, 0) / heap.length,
  },
  server: summarizeServer(serverTicks),
  allocators,
  hot,
};
await writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
await writeFile(path.join(outDir, "heap-timeline.json"), JSON.stringify(heap));
await writeFile(path.join(outDir, "cpu.cpuprofile"), JSON.stringify(cpuProfile));
await writeFile(path.join(outDir, "allocations.heapprofile"), JSON.stringify(heapProfile));
console.log(JSON.stringify({ frames, gc, heap: summary.heap, server: summary.server }, null, 2));
console.table(allocators.slice(0, 8));
console.table(hot.slice(0, 8));

function summarizeGc(events, name) {
  const pauses = events
    .filter((event) => event.name === name)
    .map((event) => event.dur / 1000)
    .sort((a, b) => a - b);
  const total = pauses.reduce((t, v) => t + v, 0);
  return {
    count: pauses.length,
    totalMs: round(total),
    maxMs: round(pauses[pauses.length - 1] ?? 0),
    p95Ms: round(pauses[Math.max(0, Math.ceil(pauses.length * 0.95) - 1)] ?? 0),
    over4ms: pauses.filter((ms) => ms > 4).length,
  };
}

function summarizeServer(samples) {
  if (samples.length === 0) return null;
  const last = samples[samples.length - 1];
  return {
    tickP50Ms: round(last.tickP50Ms),
    tickP95Ms: round(last.tickP95Ms),
    tickP99Ms: round(last.tickP99Ms),
    tickMaxMs: round(last.tickMaxMs),
    stepMsAvg: round(samples.reduce((t, s) => t + s.stepDurationMs, 0) / samples.length),
    jitterMs: round(last.tickJitterMs),
  };
}

function frameLabel(callFrame) {
  const file = callFrame.url ? callFrame.url.split("/").pop() : "";
  const name = callFrame.functionName || "(anonymous)";
  return file ? `${name} ${file}:${callFrame.lineNumber + 1}` : name;
}

function topAllocators(profile, secs) {
  const bytes = new Map();
  const walk = (node) => {
    const key = frameLabel(node.callFrame);
    bytes.set(key, (bytes.get(key) ?? 0) + node.selfSize);
    for (const child of node.children) walk(child);
  };
  walk(profile.head);
  const total = [...bytes.values()].reduce((t, v) => t + v, 0);
  return [...bytes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([fn, size]) => ({
      fn,
      MB: round(size / 1048576),
      "KB/s": round(size / 1024 / secs),
      share: `${round((size / total) * 100)}%`,
    }))
    .concat([{ fn: "TOTAL", MB: round(total / 1048576), "KB/s": round(total / 1024 / secs), share: "100%" }]);
}

function topSelfTime(profile) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const self = new Map();
  const deltas = profile.timeDeltas;
  for (let index = 0; index < profile.samples.length; index += 1) {
    const node = byId.get(profile.samples[index]);
    const key = frameLabel(node.callFrame);
    self.set(key, (self.get(key) ?? 0) + (deltas[index] ?? 0));
  }
  const total = [...self.values()].reduce((t, v) => t + v, 0);
  return [...self.entries()]
    .filter(([fn]) => fn !== "(idle)" && fn !== "(program)")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([fn, us]) => ({ fn, ms: round(us / 1000), share: `${round((us / total) * 100)}%` }));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

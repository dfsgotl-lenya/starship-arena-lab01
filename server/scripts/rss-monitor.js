import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";

const durationMs = Number(process.argv[2] ?? 30000);
const sampleMs = Number(process.argv[3] ?? 250);
const out = path.resolve(process.argv[4] ?? "./logs/rss.csv");
await mkdir(path.dirname(out), { recursive: true });
const file = createWriteStream(out);
file.write("time_ms,rss_mb\n");
const started = Date.now();
const timer = setInterval(() => {
  const elapsed = Date.now() - started;
  const rss = process.memoryUsage().rss / 1024 / 1024;
  file.write(`${elapsed},${rss.toFixed(2)}\n`);
  if (elapsed >= durationMs) {
    clearInterval(timer);
    file.end();
  }
}, sampleMs);

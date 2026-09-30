import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { once } from "node:events";

const targetMb = Number(process.argv[2] ?? 200);
const out = path.resolve(process.argv[3] ?? "./logs/synthetic-200mb.ndjson");
await mkdir(path.dirname(out), { recursive: true });
const stream = createWriteStream(out);
const line =
  JSON.stringify({
    t: Date.now(),
    type: "synthetic",
    room: "bench",
    payload: "x".repeat(1024),
  }) + "\n";
const target = targetMb * 1024 * 1024;
let written = 0;
while (written < target) {
  if (!stream.write(line)) await once(stream, "drain");
  written += Buffer.byteLength(line);
}
stream.end();
await once(stream, "close");
console.log(`generated ${(written / 1024 / 1024).toFixed(1)} MB at ${out}`);

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";

export async function* readReplayEvents(filePath) {
  const input = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      yield JSON.parse(line);
    }
  } finally {
    lines.close();
    input.destroy();
  }
}

export async function streamReplayFile(filePath, response) {
  await pipeline(createReadStream(filePath), response);
}

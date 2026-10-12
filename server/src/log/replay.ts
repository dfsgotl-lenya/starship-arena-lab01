import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import type { ServerResponse } from "node:http";

export async function* readReplayEvents(
  filePath: string,
): AsyncGenerator<unknown, void, void> {
  const input = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      const event: unknown = JSON.parse(line);
      yield event;
    }
  } finally {
    lines.close();
    input.destroy();
  }
}

export async function streamReplayFile(
  filePath: string,
  response: ServerResponse,
): Promise<void> {
  await pipeline(createReadStream(filePath), response);
}

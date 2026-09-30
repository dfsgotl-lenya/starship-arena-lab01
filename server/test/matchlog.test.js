import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { Room } from "../src/rooms.js";

test("room events are streamed as NDJSON", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "starship-log-"));
  const config = { logDir: dir };
  const room = new Room(
    { id: "test", name: "Test", capacity: 2, arena: {} },
    config,
  );
  room.join({ id: "p1", name: "Pilot", socket: {} });
  room.chat({ id: "p1", name: "Pilot" }, "hello");
  room.leave("p1");
  await new Promise((resolve) => setTimeout(resolve, 25));
  const filePath = path.join(dir, room.replayId);
  const text = await readFile(filePath, "utf8");
  assert.match(text, /"type":"join"/);
  assert.match(text, /"type":"chat"/);
  assert.match(text, /"type":"leave"/);
  await rm(dir, { recursive: true, force: true });
});

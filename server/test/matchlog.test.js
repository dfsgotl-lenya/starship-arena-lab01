import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { Room } from "../src/rooms.ts";

test("room events are streamed as NDJSON", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "starship-log-"));
  const config = {
    logDir: dir,
    port: 3001,
    host: "127.0.0.1",
    maxRooms: 12,
    roomCapacity: 8,
    maxPayload: 4096,
    messageRate: 8,
    heartbeatMs: 15000,
    slowClientBytes: 65536,
    tickRate: 30,
    netLatencyMs: 0,
    netJitterMs: 0,
    netDropPct: 0,
  };
  const room = new Room(
    { id: "test", name: "Test", capacity: 2, arena: {} },
    config,
  );
  room.join({ id: "p1", name: "Pilot", socket: {}, net: {} });
  room.chat({ id: "p1", name: "Pilot" }, "hello");
  room.leave("p1");
  await new Promise((resolve) => setTimeout(resolve, 25));
  await room.close();
  const replayId = room.replayId;
  assert.ok(replayId);
  const filePath = path.join(dir, replayId);
  const text = await readFile(filePath, "utf8");
  assert.match(text, /"type":"join"/);
  assert.match(text, /"type":"chat"/);
  assert.match(text, /"type":"leave"/);
  await rm(dir, { recursive: true, force: true });
});

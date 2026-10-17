import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Room } from "../src/rooms.ts";
import { spawnPoint } from "../src/match.ts";
import { decodeSnapshot } from "@starship-arena/shared/codec/binary.ts";
import { sequenceNumber, tickNumber } from "@starship-arena/shared/types.ts";
import { recordingPlayer, testConfig } from "./helpers.ts";

function input(seq: number, thrust = true) {
  return {
    seq: sequenceNumber(seq),
    tick: tickNumber(0),
    thrust,
    turn: 0 as const,
    fire: false,
  };
}

describe("Match game loop (fake timers)", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "Date",
        "performance",
      ],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function makeRoom() {
    return new Room(
      { id: "t", name: "Test", capacity: 4, arena: { asteroidCount: 2 } },
      testConfig(),
    );
  }

  test("ticks 30 times per simulated second without drifting", () => {
    const room = makeRoom();
    room.join(recordingPlayer("a"));
    vi.advanceTimersByTime(1000);
    expect(room.match.stats.tickCount).toBeGreaterThanOrEqual(29);
    expect(room.match.stats.tickCount).toBeLessThanOrEqual(31);
    vi.advanceTimersByTime(9000);
    expect(room.match.stats.tickCount).toBeGreaterThanOrEqual(299);
    expect(room.match.stats.tickCount).toBeLessThanOrEqual(301);
    room.match.stop();
  });

  test("stop() halts the loop and the last player leaving stops it too", () => {
    const room = makeRoom();
    room.join(recordingPlayer("a"));
    vi.advanceTimersByTime(100);
    room.match.stop();
    const ticks = room.match.stats.tickCount;
    vi.advanceTimersByTime(1000);
    expect(room.match.stats.tickCount).toBe(ticks);
    room.match.start();
    room.leave("a");
    const after = room.match.stats.tickCount;
    vi.advanceTimersByTime(1000);
    expect(room.match.stats.tickCount).toBe(after);
  });

  test("every player gets a snapshot per tick with its own lastProcessedSeq", () => {
    const room = makeRoom();
    const a = recordingPlayer("a");
    const b = recordingPlayer("b");
    room.join(a);
    room.join(b);
    room.match.handleInput("a", input(1));
    room.match.handleInput("a", input(2));
    vi.advanceTimersByTime(34);
    vi.advanceTimersByTime(34);
    expect(a.received.at(-1)?.payload.lastProcessedSeq).toBe(2);
    expect(b.received.at(-1)?.payload.lastProcessedSeq).toBe(0);
    expect(a.received.length).toBe(b.received.length);
    room.match.stop();
  });

  test("inputs are applied one per tick, in order; stale and far-future seqs are ignored", () => {
    const room = makeRoom();
    const a = recordingPlayer("a");
    room.join(a);
    room.match.handleInput("a", input(1));
    room.match.handleInput("a", input(500)); // > last + 300
    room.match.handleInput("a", input(2));
    vi.advanceTimersByTime(34);
    expect(a.received.at(-1)?.payload.lastProcessedSeq).toBe(1);
    vi.advanceTimersByTime(34);
    expect(a.received.at(-1)?.payload.lastProcessedSeq).toBe(2);
    room.match.handleInput("a", input(2)); // duplicate
    room.match.handleInput(undefined, input(3));
    room.match.handleInput("ghost", input(3));
    vi.advanceTimersByTime(34);
    expect(a.received.at(-1)?.payload.lastProcessedSeq).toBe(2);
    room.match.stop();
  });

  test("the binary frame is encoded once per tick and shared by all players", () => {
    const room = makeRoom();
    const players = ["a", "b", "c"].map(recordingPlayer);
    for (const player of players) room.join(player);
    vi.advanceTimersByTime(34);
    const frames = players.map((p) => p.received.at(-1)?.frame);
    const first = frames[0]?.binary();
    expect(first).toBeInstanceOf(ArrayBuffer);
    for (const frame of frames) expect(frame?.binary()).toBe(first);
    const decoded = decodeSnapshot(first);
    expect(decoded.entities.filter((e) => e.kind === "ship")).toHaveLength(3);
    expect(frames[0]?.json().entities.length).toBe(decoded.entities.length);
    room.match.stop();
  });

  test("stats report tick percentiles and step time", () => {
    const room = makeRoom();
    room.join(recordingPlayer("a"));
    expect(room.match.tickPercentiles().tickP50Ms).toBe(0);
    vi.advanceTimersByTime(500);
    const stats = room.match.stats;
    expect(stats.tickCount).toBeGreaterThan(10);
    expect(stats.tickP99Ms).toBeGreaterThanOrEqual(stats.tickP50Ms);
    expect(stats.tickMaxMs).toBeGreaterThanOrEqual(stats.tickP99Ms);
    expect(stats.players).toBe(1);
    room.match.stop();
  });

  test("spawn points are distinct and inside the arena", () => {
    const points = Array.from({ length: 16 }, (_, i) =>
      spawnPoint(i, 960, 600),
    );
    expect(points[0]).toEqual({ x: 240, y: 300 });
    expect(points[1]).toEqual({ x: 720, y: 300 });
    for (const p of points) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(960);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(600);
    }
    expect(
      new Set(points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)).size,
    ).toBe(16);
  });
});

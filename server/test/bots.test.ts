import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BotBrain } from "../src/bots.ts";
import { Room } from "../src/rooms.ts";
import { ClientMessageSchema } from "@starship-arena/shared/protocol/index.ts";
import {
  encodeInput,
  decodeInput,
} from "@starship-arena/shared/codec/binary.ts";
import {
  entityId,
  sequenceNumber,
  tickNumber,
} from "@starship-arena/shared/types.ts";
import type { SnapshotPayload } from "../src/types.ts";
import { testConfig } from "./helpers.ts";

function payload(entities: SnapshotPayload["entities"]): SnapshotPayload {
  return {
    version: 1,
    tick: tickNumber(5),
    time: 0,
    entities,
    scores: {},
    lastProcessedSeq: sequenceNumber(0),
    score: 0,
    serverTime: 0,
  };
}
const shipAt = (id: number, x: number, y: number, angle = 0) => ({
  id: entityId(id),
  kind: "ship" as const,
  x,
  y,
  vx: 0,
  vy: 0,
  angle,
  radius: 18,
  alive: true,
  hp: 100,
  maxHp: 100,
});

describe("bots", () => {
  test("a bot produces exactly the input packet a human client sends", () => {
    const brain = new BotBrain(1);
    const packet = brain.decide(
      payload([shipAt(1, 100, 100), shipAt(2, 300, 100)]),
      entityId(1),
    );
    // Valid for the JSON schema and survives the binary codec unchanged.
    expect(
      ClientMessageSchema.safeParse({ v: 0, type: "input", ...packet }).success,
    ).toBe(true);
    expect(decodeInput(encodeInput(packet))).toEqual(packet);
    expect(packet.tick).toBe(5);
  });

  test("seq increases by one per decision", () => {
    const brain = new BotBrain(2);
    const p1 = brain.decide(payload([]), undefined);
    const p2 = brain.decide(payload([]), undefined);
    expect(Number(p2.seq)).toBe(Number(p1.seq) + 1);
  });

  test("a bot turns towards the nearest target", () => {
    const brain = new BotBrain(3);
    // Target straight above (negative y) → angle -π/2, bot faces 0 → turn left (-1).
    const packet = brain.decide(
      payload([shipAt(1, 200, 200, 0), shipAt(2, 200, 50)]),
      entityId(1),
    );
    expect(packet.turn).toBe(-1);
  });

  describe("in a room", () => {
    beforeEach(() =>
      vi.useFakeTimers({
        toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
      }),
    );
    afterEach(() => vi.useRealTimers());

    test("bots join the match, show up in the roster and fly their ships", () => {
      const room = new Room(
        { id: "b", name: "Bots", capacity: 2, arena: { asteroidCount: 3 } },
        testConfig(),
      );
      room.addBots(8);
      expect(room.botCount).toBe(8);
      expect(room.roster()).toHaveLength(8);
      expect(room.match.stats.players).toBe(8);
      const ships = () =>
        [...room.match.world.entities.values()]
          .filter((e) => e.kind === "ship")
          .map((e) => `${e.x.toFixed(1)}`);
      const before = ships().join();
      vi.advanceTimersByTime(2000);
      expect(ships().join()).not.toBe(before);
      room.removeBots();
      expect(room.botCount).toBe(0);
      room.match.stop();
    });
  });
});

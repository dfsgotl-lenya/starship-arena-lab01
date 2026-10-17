import { describe, expect, test } from "vitest";
import {
  ClientMessageSchema,
  ServerMessageSchema,
  parseClientMessage,
  parseSnapshot,
} from "../protocol/index.ts";
import { World } from "../sim/world.ts";

const encoder = new TextEncoder();

describe("protocol", () => {
  test("accepts every valid client message type", () => {
    const messages = [
      { v: 0, type: "join", room: "alpha", name: "Pilot" },
      {
        v: 0,
        type: "input",
        seq: 1,
        tick: 2,
        thrust: true,
        turn: -1,
        fire: false,
      },
      { v: 0, type: "chat", text: "hello" },
      { v: 0, type: "leave" },
      { v: 0, type: "ping", t: 12.5 },
    ];
    for (const message of messages)
      expect(parseClientMessage(JSON.stringify(message)).success).toBe(true);
  });

  test("rejects unknown types, blank chat and bad turn", () => {
    for (const message of [
      { v: 0, type: "warp" },
      { v: 0, type: "chat", text: "   " },
      {
        v: 0,
        type: "input",
        seq: 1,
        tick: 2,
        thrust: true,
        turn: 2,
        fire: false,
      },
      { v: 1, type: "leave" },
    ]) {
      const result = parseClientMessage(JSON.stringify(message));
      expect(result.success).toBe(false);
      if (!result.success) expect(result.code).toBe("INVALID_MESSAGE");
    }
  });

  test("malformed JSON is an error result, not an exception", () => {
    const result = parseClientMessage("{not-json");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("BAD_JSON");
  });

  test("oversized frames are rejected before JSON.parse", () => {
    const result = parseClientMessage(
      JSON.stringify({ v: 0, type: "chat", text: "x".repeat(2000) }),
      100,
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("MESSAGE_TOO_LARGE");
  });

  test("accepts ArrayBuffer, byte views and fragmented buffers", () => {
    const bytes = encoder.encode(JSON.stringify({ v: 0, type: "leave" }));
    expect(parseClientMessage(bytes).success).toBe(true);
    expect(parseClientMessage(bytes.buffer).success).toBe(true);
    expect(
      parseClientMessage([bytes.subarray(0, 4), bytes.subarray(4)]).success,
    ).toBe(true);
    expect(parseClientMessage([1, 2]).success).toBe(false);
    expect(parseClientMessage({ v: 0, type: "leave" }).success).toBe(true);
  });

  test("ClientMessageSchema brands seq and tick", () => {
    const parsed = ClientMessageSchema.parse({
      v: 0,
      type: "input",
      seq: 5,
      tick: 6,
      thrust: false,
      turn: 0,
      fire: true,
    });
    expect(parsed.type === "input" && parsed.seq).toBe(5);
  });

  test("parseSnapshot validates a world snapshot and rejects garbage", () => {
    const world = new World({ seed: 1 });
    world.seedArena();
    expect(parseSnapshot(world.snapshot())).not.toBeNull();
    expect(parseSnapshot({ version: 2 })).toBeNull();
  });

  test("ServerMessageSchema accepts roster/chat/pong and rejects unknown", () => {
    expect(
      ServerMessageSchema.safeParse({
        v: 0,
        type: "roster",
        players: [{ id: "a", name: "A" }],
      }).success,
    ).toBe(true);
    expect(
      ServerMessageSchema.safeParse({
        v: 0,
        type: "chat",
        name: "A",
        text: "hi",
        t: 1,
      }).success,
    ).toBe(true);
    expect(ServerMessageSchema.safeParse({ v: 0, type: "pong" }).success).toBe(
      true,
    );
    expect(ServerMessageSchema.safeParse({ v: 0, type: "nope" }).success).toBe(
      false,
    );
  });
});

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GameConnection, messageOf } from "../src/connection.ts";
import {
  createPooledSnapshot,
  encodeSnapshot,
} from "@starship-arena/shared/codec/binary.ts";
import type { PooledSnapshot } from "@starship-arena/shared/codec/binary.ts";
import { World } from "@starship-arena/shared/sim/world.ts";
import { sequenceNumber, tickNumber } from "@starship-arena/shared/types.ts";
import { packSnapshot, unpackSnapshot } from "../src/netcode/snapshot-pack.ts";
import { decodeSnapshot } from "@starship-arena/shared/codec/binary.ts";

/** Minimal WebSocket double: lets the test push server messages. */
class FakeSocket extends EventTarget {
  static last: FakeSocket | null = null;
  static OPEN = 1;
  static CLOSED = 3;
  static CONNECTING = 0;
  readyState = 0;
  binaryType = "blob";
  readonly sent: unknown[] = [];
  constructor(readonly url: string) {
    super();
    FakeSocket.last = this;
  }
  send(data: unknown) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }
  receive(data: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}

function world() {
  const w = new World({ seed: 2, arena: { asteroidCount: 4 } });
  w.seedArena();
  w.addShip(w.allocateId(), 10, 20);
  return w;
}

describe("GameConnection", () => {
  const original = globalThis.WebSocket;
  beforeEach(() => {
    globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  });
  afterEach(() => {
    globalThis.WebSocket = original;
  });

  function connected(url = "ws://localhost/ws") {
    const connection = new GameConnection(url);
    connection.connect();
    const socket = FakeSocket.last!;
    socket.open();
    return { connection, socket };
  }

  test("binary snapshots are decoded straight into the sink's pooled slot", () => {
    const { connection, socket } = connected();
    const slot = createPooledSnapshot();
    const committed: PooledSnapshot[] = [];
    connection.snapshotSink = {
      slot: () => slot,
      commit: (s) => committed.push(s),
    };
    socket.receive(encodeSnapshot(world().snapshot(), sequenceNumber(4), 30));
    expect(committed).toEqual([slot]);
    expect(slot.count).toBe(5);
    expect(slot.lastProcessedSeq).toBe(4);
    expect(connection.snapshotsHandled).toBe(1);
  });

  test("JSON messages are validated once and dispatched; listeners read them via messageOf", () => {
    const { connection, socket } = connected();
    const seen: string[] = [];
    connection.addEventListener("chat", (event) => {
      const message = messageOf(event);
      if (message?.type === "chat") seen.push(message.text);
    });
    socket.receive(
      JSON.stringify({ v: 0, type: "chat", name: "A", text: "hello", t: 1 }),
    );
    expect(seen).toEqual(["hello"]);
    // A CustomEvent built elsewhere is not trusted.
    expect(
      messageOf(new CustomEvent("chat", { detail: { type: "chat" } })),
    ).toBeNull();
  });

  test("invalid server data becomes a protocolError event, not an exception", () => {
    const { connection, socket } = connected();
    const errors: unknown[] = [];
    connection.addEventListener("protocolError", (event) =>
      errors.push((event as CustomEvent).detail),
    );
    const slot = createPooledSnapshot();
    connection.snapshotSink = { slot: () => slot, commit: () => undefined };
    socket.receive("{broken");
    socket.receive(JSON.stringify({ v: 0, type: "unknown" }));
    socket.receive(new ArrayBuffer(3));
    expect(errors).toHaveLength(3);
  });

  test("JSON snapshots fill the same pooled shape", () => {
    const { connection, socket } = connected("ws://localhost/ws?protocol=json");
    expect(connection.protocol).toBe("json");
    const slot = createPooledSnapshot();
    connection.snapshotSink = { slot: () => slot, commit: () => undefined };
    const snap = world().snapshot();
    socket.receive(
      JSON.stringify({
        v: 0,
        type: "snapshot",
        ...snap,
        lastProcessedSeq: 2,
        score: 5,
      }),
    );
    expect(slot.count).toBe(snap.entities.length);
    expect(slot.score).toBe(5);
    expect(slot.entities[0]?.x).toBe(snap.entities[0]?.x);
  });

  test("inputs are sent as 12-byte binary frames; messages queue until open", () => {
    const connection = new GameConnection("ws://localhost/ws");
    expect(connection.send({ v: 0, type: "leave" })).toBe(false);
    connection.connect();
    const socket = FakeSocket.last!;
    socket.open();
    expect(socket.sent).toHaveLength(1);
    connection.sendInput({
      seq: sequenceNumber(1),
      tick: tickNumber(0),
      thrust: true,
      turn: 0,
      fire: false,
    });
    expect((socket.sent[1] as ArrayBuffer).byteLength).toBe(12);
    expect(connection.getBytesPerSecond()).toEqual({ in: 0, out: 0 });
  });

  test("reconnects with backoff after an unexpected close, not after close()", () => {
    vi.useFakeTimers();
    const { connection, socket } = connected();
    const delays: number[] = [];
    connection.addEventListener("reconnecting", (e) =>
      delays.push((e as CustomEvent<{ delay: number }>).detail.delay),
    );
    socket.close();
    expect(delays).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.last).not.toBe(socket);
    connection.close();
    FakeSocket.last!.close();
    expect(delays).toHaveLength(1);
    vi.useRealTimers();
  });
});

describe("worker transfer format", () => {
  test("pack → unpack round-trips a snapshot (what the worker experiment sends)", () => {
    const decoded = decodeSnapshot(
      encodeSnapshot(world().snapshot(), sequenceNumber(3), 7),
    );
    const packed = packSnapshot(decoded);
    const target = unpackSnapshot(packed, createPooledSnapshot());
    expect(target.count).toBe(decoded.entities.length);
    expect(target.score).toBe(7);
    expect(target.entities[0]?.x).toBe(decoded.entities[0]?.x);
    expect(target.entities.map((e) => e.kind)).toEqual(
      decoded.entities.map((e) => e.kind),
    );
  });
});

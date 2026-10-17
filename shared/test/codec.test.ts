import { describe, expect, test } from "vitest";
import {
  BinarySnapshotCodec,
  createPooledSnapshot,
  decodeInput,
  decodeSnapshot,
  decodeSnapshotInto,
  encodeInput,
  encodeSnapshot,
  kindCode,
  kindName,
  snapshotByteLength,
  withSnapshotHeader,
} from "../codec/binary.ts";
import { decodeJson, encodeJson } from "../codec/json.ts";
import { World } from "../sim/world.ts";
import { sequenceNumber, tickNumber } from "../types.ts";
import type { Snapshot } from "../types.ts";
import { packet } from "./fixtures.ts";

function sampleSnapshot(): Snapshot {
  const world = new World({ seed: 11, arena: { asteroidCount: 3 } });
  world.seedArena();
  const ship = world.addShip(world.allocateId(), 100, 200);
  ship.angle = 1.2345;
  ship.hp = 75;
  world.spawnBullet(ship.id, ship);
  return world.snapshot();
}

describe("binary codec", () => {
  test("input round-trip", () => {
    const input = packet(42, true, -1, true);
    expect(decodeInput(encodeInput(input))).toEqual(input);
  });

  test("input frame is exactly 12 bytes, little-endian", () => {
    const bytes = new Uint8Array(encodeInput(packet(0x01020304, false, 1)));
    expect(bytes).toHaveLength(12);
    expect([...bytes.slice(2, 6)]).toEqual([4, 3, 2, 1]);
  });

  test("encodeInput rejects invalid turn and out-of-range seq", () => {
    expect(() => encodeInput({ ...packet(1, false, 0), turn: 2 as 1 })).toThrow(
      /turn/,
    );
    expect(() =>
      encodeInput({ ...packet(1, false, 0), seq: -1 as never }),
    ).toThrow(/seq/);
  });

  test("decodeInput rejects wrong version, type, flags and turn", () => {
    const valid = encodeInput(packet(1, false, 0));
    const mutate = (offset: number, value: number) => {
      const copy = valid.slice(0);
      new DataView(copy).setUint8(offset, value);
      return copy;
    };
    expect(() => decodeInput(mutate(0, 9))).toThrow(/version/);
    expect(() => decodeInput(mutate(1, 2))).toThrow(/type/);
    expect(() => decodeInput(mutate(10, 0xff))).toThrow(/flags/);
    expect(() => decodeInput(mutate(11, 5))).toThrow(/turn/);
    expect(() => decodeInput(new Uint8Array([1, 1, 0]))).toThrow(/length/);
  });

  test("decoders accept byte views and arrays of byte views (ws fragments)", () => {
    const bytes = new Uint8Array(encodeInput(packet(7, true, 0)));
    expect(decodeInput(bytes).seq).toBe(7);
    expect(decodeInput([bytes.subarray(0, 5), bytes.subarray(5)]).seq).toBe(7);
    expect(() => decodeInput(["nope"])).toThrow(TypeError);
    expect(() => decodeInput("text")).toThrow(TypeError);
  });

  test("snapshot round-trip keeps every entity (angle quantised to 1/1000)", () => {
    const snapshot = sampleSnapshot();
    const decoded = decodeSnapshot(
      encodeSnapshot(snapshot, sequenceNumber(7), 50),
    );
    expect(decoded.lastProcessedSeq).toBe(7);
    expect(decoded.score).toBe(50);
    expect(decoded.entities).toHaveLength(snapshot.entities.length);
    const ship = decoded.entities.find((e) => e.kind === "ship");
    expect(ship?.angle).toBe(1.235);
    expect(ship?.kind === "ship" && ship.hp).toBe(75);
  });

  test("snapshot frame length is 16 + 26·n", () => {
    const snapshot = sampleSnapshot();
    expect(encodeSnapshot(snapshot).byteLength).toBe(
      snapshotByteLength(snapshot.entities.length),
    );
    expect(snapshotByteLength(0)).toBe(16);
  });

  test("encodeSnapshot rejects non-finite numbers and too many entities", () => {
    const snapshot = sampleSnapshot();
    const broken = {
      ...snapshot,
      entities: [{ ...snapshot.entities[0]!, x: Number.NaN }],
    };
    expect(() => encodeSnapshot(broken)).toThrow(/finite/);
    const many = {
      ...snapshot,
      entities: Array.from({ length: 2001 }, () => snapshot.entities[0]!),
    };
    expect(() => encodeSnapshot(many)).toThrow(/too many/);
  });

  test("decodeSnapshot rejects truncated frames and unknown kinds", () => {
    const frame = encodeSnapshot(sampleSnapshot());
    expect(() => decodeSnapshot(frame.slice(0, frame.byteLength - 1))).toThrow(
      /length/,
    );
    const badKind = frame.slice(0);
    new DataView(badKind).setUint8(16 + 2, 9);
    expect(() => decodeSnapshot(badKind)).toThrow(/kind/);
    expect(() => decodeSnapshot(new ArrayBuffer(4))).toThrow(/length/);
  });

  test("decodeSnapshotInto reuses entity objects and matches decodeSnapshot", () => {
    const frame = encodeSnapshot(sampleSnapshot(), sequenceNumber(3), 9);
    const target = createPooledSnapshot();
    decodeSnapshotInto(frame, target);
    const first = target.entities[0];
    decodeSnapshotInto(frame, target);
    expect(target.entities[0]).toBe(first);
    const reference = decodeSnapshot(frame);
    expect(target.count).toBe(reference.entities.length);
    expect(target.entities[0]?.x).toBe(reference.entities[0]?.x);
    expect(target.lastProcessedSeq).toBe(3);
  });

  test("decodeSnapshotInto leaves the target untouched when a frame is corrupt", () => {
    const frame = encodeSnapshot(sampleSnapshot());
    const target = createPooledSnapshot();
    decodeSnapshotInto(frame, target);
    const before = JSON.stringify(target);
    const corrupt = frame.slice(0);
    new DataView(corrupt).setFloat32(16 + 6, Number.NaN, true);
    expect(() => decodeSnapshotInto(corrupt, target)).toThrow();
    expect(JSON.stringify(target)).toBe(before);
  });

  test("withSnapshotHeader patches seq and score without touching the body", () => {
    const frame = encodeSnapshot(sampleSnapshot());
    const patched = withSnapshotHeader(frame, sequenceNumber(99), -5);
    const decoded = decodeSnapshot(patched);
    expect(decoded.lastProcessedSeq).toBe(99);
    expect(decoded.score).toBe(-5);
    expect(decoded.entities).toEqual(decodeSnapshot(frame).entities);
    expect(decodeSnapshot(frame).lastProcessedSeq).toBe(0);
  });

  test("kindCode and kindName are inverse; codec object round-trips", () => {
    for (const kind of ["ship", "bullet", "asteroid", "pickup"] as const)
      expect(kindName(kindCode(kind))).toBe(kind);
    const snapshot = decodeSnapshot(encodeSnapshot(sampleSnapshot()));
    expect(
      BinarySnapshotCodec.decode(BinarySnapshotCodec.encode(snapshot)),
    ).toEqual(snapshot);
    expect(Number(tickNumber(1))).toBe(1);
  });
});

describe("json codec", () => {
  test("encodes and decodes strings and byte views", () => {
    const text = encodeJson({ a: 1 });
    expect(decodeJson(text)).toEqual({ a: 1 });
    expect(decodeJson(new TextEncoder().encode(text))).toEqual({ a: 1 });
    expect(() => decodeJson("{")).toThrow(SyntaxError);
  });
});

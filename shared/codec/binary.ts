import { entityId, sequenceNumber, tickNumber } from "../types.ts";
import type {
  EntityId,
  EntityKind,
  InputPacket,
  NetworkSnapshot,
  Seq,
  Snapshot,
  SnapshotEntity,
  Tick,
} from "../types.ts";

export const BINARY_VERSION = 1;
const INPUT_TYPE = 1;
const SNAPSHOT_TYPE = 2;
const HEADER_BYTES = 16;
const ENTITY_BYTES = 26;
const MAX_ENTITIES = 2_000;

export interface BinaryInput {
  readonly seq: Seq;
  readonly tick: Tick;
  readonly thrust: boolean;
  readonly turn: -1 | 0 | 1;
  readonly fire: boolean;
}
export interface Codec<Encoded, Decoded> {
  encode(message: Decoded): Encoded;
  decode(data: unknown): Decoded;
}

export function encodeInput({
  seq,
  tick,
  thrust,
  turn,
  fire,
}: BinaryInput | InputPacket): ArrayBuffer {
  assertUint32(seq, "seq");
  assertUint32(tick, "tick");
  if (turn !== -1 && turn !== 0 && turn !== 1)
    throw new RangeError("invalid input turn");
  const buffer = new ArrayBuffer(12);
  const view = new DataView(buffer);
  view.setUint8(0, BINARY_VERSION);
  view.setUint8(1, INPUT_TYPE);
  view.setUint32(2, seq, true);
  view.setUint32(6, tick, true);
  const flags = (thrust ? 1 : 0) | (fire ? 2 : 0);
  view.setUint8(10, flags);
  view.setInt8(11, turn);
  return buffer;
}

export function decodeInput(data: unknown): BinaryInput {
  const buffer = toArrayBuffer(data, "binary input");
  if (buffer.byteLength !== 12) throw new Error("invalid binary input length");
  const view = new DataView(buffer);
  assertHeader(view, INPUT_TYPE);
  const flags = view.getUint8(10);
  if ((flags & 0xfc) !== 0) throw new Error("invalid binary input flags");
  const turnValue = view.getInt8(11);
  if (turnValue !== -1 && turnValue !== 0 && turnValue !== 1)
    throw new Error("invalid binary input turn");
  return {
    seq: sequenceNumber(view.getUint32(2, true)),
    tick: tickNumber(view.getUint32(6, true)),
    thrust: Boolean(flags & 1),
    fire: Boolean(flags & 2),
    turn: turnValue,
  };
}

export function encodeSnapshot(
  snapshot: Snapshot | NetworkSnapshot,
  lastProcessedSeq: Seq = sequenceNumber(0),
  score = 0,
): ArrayBuffer {
  const count = snapshot.entities.length;
  if (count > MAX_ENTITIES || count > 0xffff)
    throw new RangeError("snapshot contains too many entities");
  assertUint32(snapshot.tick, "snapshot tick");
  assertUint32(lastProcessedSeq, "lastProcessedSeq");
  assertInt32(score, "score");
  const buffer = new ArrayBuffer(HEADER_BYTES + count * ENTITY_BYTES);
  const view = new DataView(buffer);
  view.setUint8(0, BINARY_VERSION);
  view.setUint8(1, SNAPSHOT_TYPE);
  view.setUint32(2, snapshot.tick, true);
  view.setUint16(6, count, true);
  view.setUint32(8, lastProcessedSeq, true);
  view.setInt32(12, score, true);
  let offset = HEADER_BYTES;
  for (const entity of snapshot.entities) {
    assertUint16(entity.id, "entity id");
    const ownerId = entity.kind === "bullet" ? entity.ownerId : 0;
    assertUint16(ownerId, "owner id");
    view.setUint16(offset, entity.id, true);
    view.setUint8(offset + 2, kindCode(entity.kind));
    view.setUint8(
      offset + 3,
      ("homing" in entity && entity.homing ? 1 : 0) | (entity.alive ? 2 : 0),
    );
    view.setUint16(offset + 4, ownerId, true);
    setFiniteFloat(view, offset + 6, entity.x, "x");
    setFiniteFloat(view, offset + 10, entity.y, "y");
    setFiniteFloat(view, offset + 14, entity.vx, "vx");
    setFiniteFloat(view, offset + 18, entity.vy, "vy");
    const angle = Math.round(entity.angle * 1000);
    if (!Number.isInteger(angle) || angle < -32768 || angle > 32767)
      throw new RangeError("angle is outside int16 range");
    view.setInt16(offset + 22, angle, true);
    const hp = "hp" in entity ? Math.round(entity.hp) : 0;
    if (hp < 0 || hp > 65535)
      throw new RangeError("hp is outside uint16 range");
    view.setUint16(offset + 24, hp, true);
    offset += ENTITY_BYTES;
  }
  return buffer;
}

export function decodeSnapshot(data: unknown): NetworkSnapshot {
  const buffer = toArrayBuffer(data, "binary snapshot");
  if (buffer.byteLength < HEADER_BYTES)
    throw new Error("invalid binary snapshot length");
  const view = new DataView(buffer);
  assertHeader(view, SNAPSHOT_TYPE);
  const tick = tickNumber(view.getUint32(2, true));
  const count = view.getUint16(6, true);
  if (count > MAX_ENTITIES)
    throw new Error("binary snapshot entity count is out of range");
  if (buffer.byteLength !== HEADER_BYTES + count * ENTITY_BYTES)
    throw new Error("invalid binary snapshot length");
  const lastProcessedSeq = sequenceNumber(view.getUint32(8, true));
  const score = view.getInt32(12, true);
  const entities: SnapshotEntity[] = [];
  let offset = HEADER_BYTES;
  for (let index = 0; index < count; index += 1) {
    const id = entityId(view.getUint16(offset, true));
    const kind = kindName(view.getUint8(offset + 2));
    const flags = view.getUint8(offset + 3);
    if ((flags & 0xfc) !== 0) throw new Error("invalid binary entity flags");
    const ownerIdValue = view.getUint16(offset + 4, true);
    const x = finite(view.getFloat32(offset + 6, true), "x");
    const y = finite(view.getFloat32(offset + 10, true), "y");
    const vx = finite(view.getFloat32(offset + 14, true), "vx");
    const vy = finite(view.getFloat32(offset + 18, true), "vy");
    const angle = view.getInt16(offset + 22, true) / 1000;
    const hp = view.getUint16(offset + 24, true);
    const base = { id, x, y, vx, vy, angle, alive: Boolean(flags & 2) };
    switch (kind) {
      case "ship":
        entities.push({
          ...base,
          kind,
          radius: 18,
          hp,
          maxHp: Math.max(100, hp),
        });
        break;
      case "bullet":
        entities.push({
          ...base,
          kind,
          ownerId: entityId(ownerIdValue),
          radius: 5,
          ttl: 1,
          homing: Boolean(flags & 1),
        });
        break;
      case "asteroid":
        entities.push({
          ...base,
          kind,
          radius: 28,
          homing: Boolean(flags & 1),
          variant: index % 4,
        });
        break;
      case "pickup":
        entities.push({ ...base, kind, radius: 12, variant: index % 4 });
        break;
      default:
        assertNever(kind);
    }
    offset += ENTITY_BYTES;
  }
  return { version: 1, tick, lastProcessedSeq, score, entities };
}

/** Size in bytes of a binary snapshot frame with `count` entities. */
export function snapshotByteLength(count: number): number {
  return HEADER_BYTES + count * ENTITY_BYTES;
}
export const INPUT_BYTE_LENGTH = 12;

/**
 * Server fan-out helper: the entity body is identical for every client, only
 * `lastProcessedSeq` and `score` in the header differ. Copy the frame encoded
 * once per tick and patch those 8 bytes instead of re-encoding per client.
 */
export function withSnapshotHeader(
  frame: ArrayBuffer,
  lastProcessedSeq: Seq,
  score: number,
): Uint8Array {
  assertUint32(lastProcessedSeq, "lastProcessedSeq");
  assertInt32(score, "score");
  const copy = new Uint8Array(frame.byteLength);
  copy.set(new Uint8Array(frame));
  const view = new DataView(copy.buffer);
  view.setUint32(8, lastProcessedSeq, true);
  view.setInt32(12, score, true);
  return copy;
}

/**
 * One monomorphic entity shape for every kind. The client decodes snapshots
 * into pooled objects of this shape, so property access sites in render and
 * interpolation stay monomorphic and no objects are created per message.
 */
export interface NetEntity {
  id: EntityId;
  kind: EntityKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  alive: boolean;
  hp: number;
  maxHp: number;
  ownerId: EntityId;
  ttl: number;
  homing: boolean;
  variant: number;
}
export interface PooledSnapshot {
  tick: Tick;
  lastProcessedSeq: Seq;
  score: number;
  count: number;
  /** Grows to the largest snapshot seen; only the first `count` are valid. */
  readonly entities: NetEntity[];
}

export function blankNetEntity(): NetEntity {
  return {
    id: entityId(0),
    kind: "ship",
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 0,
    alive: false,
    hp: 0,
    maxHp: 0,
    ownerId: entityId(0),
    ttl: 0,
    homing: false,
    variant: 0,
  };
}
export function createPooledSnapshot(): PooledSnapshot {
  return {
    tick: tickNumber(0),
    lastProcessedSeq: sequenceNumber(0),
    score: 0,
    count: 0,
    entities: [],
  };
}

/**
 * Allocation-free twin of `decodeSnapshot`: validates the same way, then
 * writes into `target`, reusing its entity objects.
 */
export function decodeSnapshotInto(
  data: ArrayBuffer,
  target: PooledSnapshot,
): PooledSnapshot {
  if (!(data instanceof ArrayBuffer))
    throw new TypeError("binary snapshot must be an ArrayBuffer");
  if (data.byteLength < HEADER_BYTES)
    throw new Error("invalid binary snapshot length");
  const view = new DataView(data);
  assertHeader(view, SNAPSHOT_TYPE);
  const count = view.getUint16(6, true);
  if (count > MAX_ENTITIES)
    throw new Error("binary snapshot entity count is out of range");
  if (data.byteLength !== HEADER_BYTES + count * ENTITY_BYTES)
    throw new Error("invalid binary snapshot length");
  // Validate everything before mutating `target`, so a bad frame never
  // leaves a half-written snapshot behind.
  for (let index = 0, offset = HEADER_BYTES; index < count; index += 1) {
    kindName(view.getUint8(offset + 2));
    if ((view.getUint8(offset + 3) & 0xfc) !== 0)
      throw new Error("invalid binary entity flags");
    for (let field = 6; field <= 18; field += 4)
      finite(view.getFloat32(offset + field, true), "position");
    offset += ENTITY_BYTES;
  }
  target.tick = tickNumber(view.getUint32(2, true));
  target.lastProcessedSeq = sequenceNumber(view.getUint32(8, true));
  target.score = view.getInt32(12, true);
  target.count = count;
  const entities = target.entities;
  while (entities.length < count) entities.push(blankNetEntity());
  let offset = HEADER_BYTES;
  for (let index = 0; index < count; index += 1) {
    const entity = entities[index]!;
    const kind = kindName(view.getUint8(offset + 2));
    const flags = view.getUint8(offset + 3);
    const hp = view.getUint16(offset + 24, true);
    entity.id = entityId(view.getUint16(offset, true));
    entity.kind = kind;
    entity.alive = (flags & 2) !== 0;
    entity.homing = (flags & 1) !== 0;
    entity.ownerId = entityId(
      kind === "bullet" ? view.getUint16(offset + 4, true) : 0,
    );
    entity.x = view.getFloat32(offset + 6, true);
    entity.y = view.getFloat32(offset + 10, true);
    entity.vx = view.getFloat32(offset + 14, true);
    entity.vy = view.getFloat32(offset + 18, true);
    entity.angle = view.getInt16(offset + 22, true) / 1000;
    entity.hp = kind === "ship" ? hp : 0;
    entity.maxHp = kind === "ship" ? Math.max(100, hp) : 0;
    entity.radius =
      kind === "ship"
        ? 18
        : kind === "bullet"
          ? 5
          : kind === "asteroid"
            ? 28
            : 12;
    entity.ttl = kind === "bullet" ? 1 : 0;
    entity.variant = index % 4;
    offset += ENTITY_BYTES;
  }
  return target;
}

export function kindCode(kind: EntityKind): number {
  switch (kind) {
    case "ship":
      return 1;
    case "bullet":
      return 2;
    case "asteroid":
      return 3;
    case "pickup":
      return 4;
    default:
      return assertNever(kind);
  }
}

export function kindName(code: number): EntityKind {
  switch (code) {
    case 1:
      return "ship";
    case 2:
      return "bullet";
    case 3:
      return "asteroid";
    case 4:
      return "pickup";
    default:
      throw new Error(`unknown binary entity kind: ${code}`);
  }
}

function toArrayBuffer(data: unknown, label: string): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    return copyView(data);
  }
  if (Array.isArray(data)) {
    const rawParts: readonly unknown[] = data;
    const parts: ArrayBufferView[] = [];
    for (const part of rawParts) {
      if (!ArrayBuffer.isView(part))
        throw new TypeError(`${label} contains a non-byte-view part`);
      parts.push(part);
    }
    const length = parts.reduce((total, part) => total + part.byteLength, 0);
    const copy = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      copy.set(
        new Uint8Array(part.buffer, part.byteOffset, part.byteLength),
        offset,
      );
      offset += part.byteLength;
    }
    return copy.buffer;
  }
  throw new TypeError(
    `${label} must be an ArrayBuffer, byte view, or an array of byte views`,
  );
}
function copyView(view: ArrayBufferView): ArrayBuffer {
  const copy = new Uint8Array(view.byteLength);
  copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return copy.buffer;
}

function assertHeader(view: DataView, type: number): void {
  if (view.getUint8(0) !== BINARY_VERSION)
    throw new Error("unsupported binary protocol version");
  if (view.getUint8(1) !== type) throw new Error("invalid binary message type");
}
function assertUint32(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff)
    throw new RangeError(`${name} is outside uint32 range`);
}
function assertUint16(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff)
    throw new RangeError(`${name} is outside uint16 range`);
}
function assertInt32(value: number, name: string): void {
  if (!Number.isInteger(value) || value < -0x8000_0000 || value > 0x7fff_ffff)
    throw new RangeError(`${name} is outside int32 range`);
}
function setFiniteFloat(
  view: DataView,
  offset: number,
  value: number,
  name: string,
): void {
  finite(value, name);
  view.setFloat32(offset, value, true);
}
function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  return value;
}
function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${String(value)}`);
}

export const BinarySnapshotCodec: Codec<ArrayBuffer, NetworkSnapshot> = {
  encode: (snapshot) =>
    encodeSnapshot(snapshot, snapshot.lastProcessedSeq, snapshot.score),
  decode: decodeSnapshot,
};

const VERSION = 1;
const INPUT_TYPE = 1;
const SNAPSHOT_TYPE = 2;
const HEADER_BYTES = 16;
const ENTITY_BYTES = 26;

export function encodeInput({ seq, tick, thrust, turn, fire }) {
  const buffer = new ArrayBuffer(12);
  const view = new DataView(buffer);
  view.setUint8(0, VERSION);
  view.setUint8(1, INPUT_TYPE);
  view.setUint32(2, seq >>> 0, true);
  view.setUint32(6, tick >>> 0, true);
  const flags = (thrust ? 1 : 0) | (fire ? 2 : 0);
  view.setUint8(10, flags);
  view.setInt8(11, Math.max(-1, Math.min(1, turn | 0)));
  return buffer;
}

export function decodeInput(buffer) {
  if ((buffer.byteLength ?? 0) < 12)
    throw new Error("invalid binary input length");
  const view = new DataView(
    buffer instanceof ArrayBuffer ? buffer : buffer.buffer,
    buffer.byteOffset ?? 0,
    buffer.byteLength,
  );
  if (view.getUint8(0) !== VERSION || view.getUint8(1) !== INPUT_TYPE)
    throw new Error("invalid binary input header");
  const flags = view.getUint8(10);
  return {
    seq: view.getUint32(2, true),
    tick: view.getUint32(6, true),
    thrust: Boolean(flags & 1),
    fire: Boolean(flags & 2),
    turn: view.getInt8(11),
  };
}

export function encodeSnapshot(snapshot, lastProcessedSeq = 0, score = 0) {
  const count = snapshot.entities.length;
  const buffer = new ArrayBuffer(HEADER_BYTES + count * ENTITY_BYTES);
  const view = new DataView(buffer);
  view.setUint8(0, VERSION);
  view.setUint8(1, SNAPSHOT_TYPE);
  view.setUint32(2, snapshot.tick >>> 0, true);
  view.setUint16(6, count, true);
  view.setUint32(8, lastProcessedSeq >>> 0, true);
  view.setInt32(12, score | 0, true);
  let offset = HEADER_BYTES;
  for (const entity of snapshot.entities) {
    view.setUint16(offset, entity.id & 0xffff, true);
    view.setUint8(offset + 2, kindCode(entity.kind));
    view.setUint8(
      offset + 3,
      (entity.homing ? 1 : 0) | ((entity.alive ? 1 : 0) << 1),
    );
    view.setUint16(offset + 4, (entity.ownerId ?? 0) & 0xffff, true);
    view.setFloat32(offset + 6, entity.x, true);
    view.setFloat32(offset + 10, entity.y, true);
    view.setFloat32(offset + 14, entity.vx ?? 0, true);
    view.setFloat32(offset + 18, entity.vy ?? 0, true);
    view.setInt16(offset + 22, Math.round((entity.angle ?? 0) * 1000), true);
    view.setUint16(
      offset + 24,
      Math.max(0, Math.min(65535, Math.round(entity.hp ?? 0))),
      true,
    );
    offset += ENTITY_BYTES;
  }
  return buffer;
}

export function decodeSnapshot(buffer) {
  if ((buffer.byteLength ?? 0) < HEADER_BYTES)
    throw new Error("invalid binary snapshot length");
  const view = new DataView(
    buffer instanceof ArrayBuffer ? buffer : buffer.buffer,
    buffer.byteOffset ?? 0,
    buffer.byteLength,
  );
  if (view.getUint8(0) !== VERSION || view.getUint8(1) !== SNAPSHOT_TYPE)
    throw new Error("invalid binary snapshot header");
  const tick = view.getUint32(2, true);
  const count = view.getUint16(6, true);
  if (buffer.byteLength < HEADER_BYTES + count * ENTITY_BYTES)
    throw new Error("truncated binary snapshot");
  const lastProcessedSeq = view.getUint32(8, true);
  const score = view.getInt32(12, true);
  const entities = [];
  let offset = HEADER_BYTES;
  for (let index = 0; index < count; index += 1) {
    const flags = view.getUint8(offset + 3);
    entities.push({
      id: view.getUint16(offset, true),
      kind: kindName(view.getUint8(offset + 2)),
      homing: Boolean(flags & 1),
      alive: Boolean(flags & 2),
      ownerId: view.getUint16(offset + 4, true),
      x: view.getFloat32(offset + 6, true),
      y: view.getFloat32(offset + 10, true),
      vx: view.getFloat32(offset + 14, true),
      vy: view.getFloat32(offset + 18, true),
      angle: view.getInt16(offset + 22, true) / 1000,
      hp: view.getUint16(offset + 24, true),
      radius:
        kindName(view.getUint8(offset + 2)) === "ship"
          ? 18
          : kindName(view.getUint8(offset + 2)) === "bullet"
            ? 5
            : 28,
      ttl: 1,
      variant: index % 4,
    });
    offset += ENTITY_BYTES;
  }
  return { version: VERSION, tick, lastProcessedSeq, score, entities };
}

export function kindCode(kind) {
  return kind === "ship"
    ? 1
    : kind === "bullet"
      ? 2
      : kind === "asteroid"
        ? 3
        : 4;
}
export function kindName(code) {
  return code === 1
    ? "ship"
    : code === 2
      ? "bullet"
      : code === 3
        ? "asteroid"
        : "pickup";
}
export { VERSION };

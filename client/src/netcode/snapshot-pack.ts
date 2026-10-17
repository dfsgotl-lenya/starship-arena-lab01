import {
  entityId,
  sequenceNumber,
  tickNumber,
} from "@starship-arena/shared/types.ts";
import {
  blankNetEntity,
  kindCode,
  kindName,
} from "@starship-arena/shared/codec/binary.ts";
import type { PooledSnapshot } from "@starship-arena/shared/codec/binary.ts";
import type { NetworkSnapshot } from "@starship-arena/shared/types.ts";

/**
 * Transferable layout used by the Web Worker experiment: a Float64Array with
 * a 4-number header (tick, lastProcessedSeq, score, count) followed by 10
 * numbers per entity. Transferring it back is zero-copy.
 */
export const PACK_HEADER = 4;
export const PACK_STRIDE = 10;

export function packSnapshot(snapshot: NetworkSnapshot): Float64Array {
  const out = new Float64Array(
    PACK_HEADER + snapshot.entities.length * PACK_STRIDE,
  );
  out[0] = snapshot.tick;
  out[1] = snapshot.lastProcessedSeq;
  out[2] = snapshot.score;
  out[3] = snapshot.entities.length;
  let offset = PACK_HEADER;
  for (const entity of snapshot.entities) {
    out[offset] = entity.id;
    out[offset + 1] = kindCode(entity.kind);
    out[offset + 2] = entity.alive ? 1 : 0;
    out[offset + 3] = entity.kind === "bullet" ? entity.ownerId : 0;
    out[offset + 4] = entity.x;
    out[offset + 5] = entity.y;
    out[offset + 6] = entity.vx;
    out[offset + 7] = entity.vy;
    out[offset + 8] = entity.angle;
    out[offset + 9] = entity.kind === "ship" ? entity.hp : 0;
    offset += PACK_STRIDE;
  }
  return out;
}

export function unpackSnapshot(
  data: Float64Array,
  target: PooledSnapshot,
): PooledSnapshot {
  const count = data[3] ?? 0;
  target.tick = tickNumber(data[0] ?? 0);
  target.lastProcessedSeq = sequenceNumber(data[1] ?? 0);
  target.score = data[2] ?? 0;
  target.count = count;
  while (target.entities.length < count) target.entities.push(blankNetEntity());
  let offset = PACK_HEADER;
  for (let index = 0; index < count; index += 1) {
    const entity = target.entities[index]!;
    const kind = kindName(data[offset + 1] ?? 0);
    entity.id = entityId(data[offset] ?? 0);
    entity.kind = kind;
    entity.alive = data[offset + 2] === 1;
    entity.ownerId = entityId(data[offset + 3] ?? 0);
    entity.x = data[offset + 4] ?? 0;
    entity.y = data[offset + 5] ?? 0;
    entity.vx = data[offset + 6] ?? 0;
    entity.vy = data[offset + 7] ?? 0;
    entity.angle = data[offset + 8] ?? 0;
    entity.hp = data[offset + 9] ?? 0;
    entity.maxHp = kind === "ship" ? Math.max(100, entity.hp) : 0;
    entity.radius =
      kind === "ship"
        ? 18
        : kind === "bullet"
          ? 5
          : kind === "asteroid"
            ? 28
            : 12;
    entity.ttl = kind === "bullet" ? 1 : 0;
    entity.homing = false;
    entity.variant = index % 4;
    offset += PACK_STRIDE;
  }
  return target;
}

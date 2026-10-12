/** Numeric values branded at compile time so ids, ticks, and sequence numbers cannot be mixed. */
export type BrandedNumber<Name extends string> = number & {
  readonly __brand: Name;
};
export type EntityId = BrandedNumber<"EntityId">;
export type Tick = BrandedNumber<"Tick">;
export type Seq = BrandedNumber<"Seq">;

/** The single checked branding gate; the cast is safe after the runtime range check. */
export function brandNumber<Name extends string>(
  value: number,
  label: Name,
): BrandedNumber<Name> {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`${label} must be a non-negative safe integer`);
  // Branded primitives have no runtime representation, so one checked cast is required here.
  return value as BrandedNumber<Name>;
}

export function entityId(value: number): EntityId {
  if (!Number.isInteger(value) || value > 0xffff)
    throw new RangeError("EntityId must fit uint16");
  return brandNumber(value, "EntityId");
}
export function tickNumber(value: number): Tick {
  if (!Number.isInteger(value) || value > 0xffff_ffff)
    throw new RangeError("Tick must fit uint32");
  return brandNumber(value, "Tick");
}
export function sequenceNumber(value: number): Seq {
  if (!Number.isInteger(value) || value > 0xffff_ffff)
    throw new RangeError("Seq must fit uint32");
  return brandNumber(value, "Seq");
}

export type Turn = -1 | 0 | 1;
export interface InputState {
  readonly thrust: boolean;
  readonly turn: Turn;
  readonly fire: boolean;
}
export interface InputPacket extends InputState {
  readonly seq: Seq;
  readonly tick: Tick;
}
export interface ArenaConfig {
  readonly asteroidCount?: number;
  readonly homingEvery?: number;
  readonly asteroidSpeedMin?: number;
  readonly asteroidSpeedMax?: number;
}

export type EntityKind = "ship" | "bullet" | "asteroid" | "pickup";
export interface EntityBase {
  id: EntityId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  alive: boolean;
}
export interface ShipEntity extends EntityBase {
  kind: "ship";
  hp: number;
  maxHp: number;
  turnSpeed: number;
  thrustAcceleration: number;
  drag: number;
  maxSpeed: number;
  fireCooldown: number;
  fireInterval: number;
}
export interface BulletEntity extends EntityBase {
  kind: "bullet";
  ownerId: EntityId;
  ttl: number;
  homing: boolean;
}
export interface AsteroidEntity extends EntityBase {
  kind: "asteroid";
  homing: boolean;
  variant: number;
}
export interface PickupEntity extends EntityBase {
  kind: "pickup";
  variant: number;
}
export type Entity = ShipEntity | BulletEntity | AsteroidEntity | PickupEntity;

interface SnapshotEntityBase {
  readonly id: EntityId;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly radius: number;
  readonly alive: boolean;
}
export type ShipSnapshotEntity = SnapshotEntityBase & {
  readonly kind: "ship";
  readonly hp: number;
  readonly maxHp: number;
};
export type BulletSnapshotEntity = SnapshotEntityBase & {
  readonly kind: "bullet";
  readonly ownerId: EntityId;
  readonly ttl: number;
  readonly homing: boolean;
};
export type AsteroidSnapshotEntity = SnapshotEntityBase & {
  readonly kind: "asteroid";
  readonly homing: boolean;
  readonly variant: number;
};
export type PickupSnapshotEntity = SnapshotEntityBase & {
  readonly kind: "pickup";
  readonly variant: number;
};
export type SnapshotEntity =
  | ShipSnapshotEntity
  | BulletSnapshotEntity
  | AsteroidSnapshotEntity
  | PickupSnapshotEntity;
export interface Snapshot {
  readonly version: 1;
  readonly tick: Tick;
  readonly time: number;
  readonly entities: readonly SnapshotEntity[];
  readonly scores: Readonly<Record<string, number>>;
}
export interface NetworkSnapshot {
  readonly version: 1;
  readonly tick: Tick;
  readonly lastProcessedSeq: Seq;
  readonly score: number;
  readonly entities: readonly SnapshotEntity[];
}

export type WorldEvent =
  | { readonly type: "fired"; readonly ownerId: EntityId }
  | {
      readonly type: "hit";
      readonly targetId: EntityId;
      readonly ownerId: EntityId;
    }
  | { readonly type: "exploded"; readonly targetId: EntityId }
  | { readonly type: "respawned"; readonly playerId: EntityId };

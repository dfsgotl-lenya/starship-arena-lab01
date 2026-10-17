import { mulberry32, seedFromString } from "./prng.ts";
import {
  blankBullet,
  createAsteroid,
  createShip,
  initBullet,
} from "./entity.ts";
import type { Muzzle } from "./entity.ts";
import { integrateInPlace, wrapPosition } from "./integrate.ts";
import { CollisionSystem } from "./collision.ts";
import type { Broadphase } from "./collision.ts";
import { Pool } from "./pool.ts";
import { entityId, tickNumber } from "../types.ts";
import type {
  ArenaConfig,
  BulletEntity,
  Entity,
  EntityId,
  InputState,
  Snapshot,
  SnapshotEntity,
  Tick,
  WorldEvent,
} from "../types.ts";

export interface WorldOptions {
  readonly width?: number;
  readonly height?: number;
  readonly seed?: number;
  readonly arena?: ArenaConfig;
  /** Collision broad phase: spatial hash (default) or all-vs-all. */
  readonly broadphase?: Broadphase;
}

const IDLE_INPUT: InputState = Object.freeze({
  thrust: false,
  turn: 0,
  fire: false,
});
const NO_INPUTS: ReadonlyMap<EntityId, InputState> = new Map();
interface RespawnEntry {
  readonly playerId: EntityId;
  readonly at: number;
}

export class World {
  readonly width: number;
  readonly height: number;
  seed: number;
  arena: ArenaConfig;
  time = 0;
  tick: Tick = tickNumber(0);
  nextId = 1;
  readonly entities = new Map<EntityId, Entity>();
  readonly scores = new Map<EntityId, number>();
  events: WorldEvent[] = [];
  respawns: RespawnEntry[] = [];
  /** Gameplay RNG (asteroid refills); seeded, so the step stays deterministic. */
  #rng = mulberry32(1);
  #asteroidTimer = 0;
  readonly collisions: CollisionSystem;
  /** Bullets are recycled: a dead bullet goes back here instead of to the GC. */
  readonly bulletPool = new Pool<BulletEntity>(blankBullet, { prefill: 64 });
  readonly #liveEntities: Entity[] = [];

  constructor({
    width = 960,
    height = 600,
    seed = 1,
    arena = {},
    broadphase = "hash",
  }: WorldOptions = {}) {
    this.width = width;
    this.height = height;
    this.seed = seed >>> 0;
    this.arena = { ...arena };
    this.#rng = mulberry32(this.seed ^ 0x9e3779b9);
    this.collisions = new CollisionSystem(width, height, broadphase);
  }

  /**
   * Allocates a uint16 entity id. Ids wrap after 65535 and skip ids that are
   * still alive, so a long match never overflows the binary protocol.
   */
  allocateId(): EntityId {
    for (let attempts = 0; attempts < 0xffff; attempts += 1) {
      if (this.nextId > 0xffff || this.nextId < 1) this.nextId = 1;
      const candidate = entityId(this.nextId++);
      if (!this.entities.has(candidate)) return candidate;
    }
    throw new RangeError("no free entity ids");
  }

  add<T extends Entity>(entity: T): T {
    this.entities.set(entity.id, entity);
    return entity;
  }

  remove(id: EntityId): void {
    const entity = this.entities.get(id);
    this.entities.delete(id);
    if (entity?.kind === "bullet") this.bulletPool.release(entity);
  }

  addShip(id: EntityId, x = this.width / 2, y = this.height / 2) {
    const ship = createShip(id, x, y);
    this.scores.set(id, this.scores.get(id) ?? 0);
    return this.add(ship);
  }

  spawnBullet(ownerId: EntityId, ship: Muzzle): BulletEntity {
    const bullet = initBullet(
      this.bulletPool.acquire(),
      this.allocateId(),
      ownerId,
      ship,
    );
    return this.add(bullet);
  }

  reset(seed = this.seed): void {
    this.seed = seed >>> 0;
    this.time = 0;
    this.tick = tickNumber(0);
    this.nextId = 1;
    this.entities.clear();
    this.events = [];
    this.respawns = [];
    this.#rng = mulberry32(this.seed ^ 0x9e3779b9);
    this.#asteroidTimer = 0;
  }

  seedArena(config: ArenaConfig = this.arena): void {
    this.arena = { ...config };
    const rng = mulberry32(this.seed);
    const count = config.asteroidCount ?? 8;
    const homingEvery = Math.max(1, config.homingEvery ?? 4);
    const minSpeed = config.asteroidSpeedMin ?? 30;
    const maxSpeed = config.asteroidSpeedMax ?? 80;
    for (let index = 0; index < count; index += 1) {
      let x = 0;
      let y = 0;
      do {
        x = 50 + rng() * Math.max(1, this.width - 100);
        y = 50 + rng() * Math.max(1, this.height - 100);
      } while (Math.hypot(x - this.width / 2, y - this.height / 2) < 140);
      const angle = rng() * Math.PI * 2;
      const speed = minSpeed + rng() * (maxSpeed - minSpeed);
      const radius = 22 + rng() * 18;
      this.add(
        createAsteroid(
          this.allocateId(),
          x,
          y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          radius,
          index % homingEvery === 0,
          index % 4,
        ),
      );
    }
  }

  step(
    dt: number,
    inputs: ReadonlyMap<EntityId, InputState> = NO_INPUTS,
  ): void {
    this.time += dt;
    this.tick = tickNumber(Number(this.tick) + 1);
    // Reuse the same array: events are read synchronously after step().
    this.events.length = 0;
    for (const entity of this.entities.values()) {
      if (!entity.alive) continue;
      if (entity.kind === "ship") {
        const input = inputs.get(entity.id) ?? IDLE_INPUT;
        integrateInPlace(entity, input, dt, entity);
        if (input.fire && entity.fireCooldown <= 0) {
          this.spawnBullet(entity.id, entity);
          entity.fireCooldown = entity.fireInterval;
          this.events.push({ type: "fired", ownerId: entity.id });
        }
      } else if (entity.kind === "bullet") {
        entity.x += entity.vx * dt;
        entity.y += entity.vy * dt;
        entity.ttl -= dt;
        if (entity.ttl <= 0) entity.alive = false;
      } else if (entity.kind === "asteroid") {
        entity.x += entity.vx * dt;
        entity.y += entity.vy * dt;
      } else if (entity.kind === "pickup") {
        // Pickups are currently static; keeping this arm explicit makes the union exhaustive.
      } else {
        assertNever(entity);
      }
      wrapPosition(entity, this.width, this.height);
    }
    this.collisions.resolve(this);
    this.#sweep();
    this.#processRespawns();
    this.#refillAsteroids(dt);
  }

  /** Destroyed asteroids come back from the arena edge, one every 1.5 s. */
  #refillAsteroids(dt: number): void {
    const target = this.arena.asteroidCount ?? 0;
    if (target <= 0) return;
    let alive = 0;
    for (const entity of this.entities.values())
      if (entity.kind === "asteroid") alive += 1;
    if (alive >= target) {
      this.#asteroidTimer = 0;
      return;
    }
    this.#asteroidTimer += dt;
    if (this.#asteroidTimer < 1.5) return;
    this.#asteroidTimer = 0;
    const rng = this.#rng;
    const minSpeed = this.arena.asteroidSpeedMin ?? 30;
    const maxSpeed = this.arena.asteroidSpeedMax ?? 80;
    const edge = Math.floor(rng() * 4);
    const along = rng();
    const x = edge === 0 ? 0 : edge === 1 ? this.width - 1 : along * this.width;
    const y =
      edge === 2 ? 0 : edge === 3 ? this.height - 1 : along * this.height;
    const angle = rng() * Math.PI * 2;
    const speed = minSpeed + rng() * (maxSpeed - minSpeed);
    const homingEvery = Math.max(1, this.arena.homingEvery ?? 4);
    const variant = Math.floor(rng() * 4);
    this.add(
      createAsteroid(
        this.allocateId(),
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        22 + rng() * 18,
        variant % homingEvery === 0,
        variant,
      ),
    );
  }

  scheduleRespawn(playerId: EntityId): void {
    this.respawns.push({ playerId, at: this.time + 2 });
  }

  #processRespawns(): void {
    if (this.respawns.length === 0) return;
    let kept = 0;
    for (const entry of this.respawns) {
      if (entry.at > this.time) {
        this.respawns[kept++] = entry;
        continue;
      }
      const ship = this.addShip(
        entry.playerId,
        this.width / 2,
        this.height / 2,
      );
      this.events.push({ type: "respawned", playerId: ship.id });
    }
    this.respawns.length = kept;
  }

  #sweep(): void {
    for (const [id, entity] of this.entities) {
      if (entity.alive) continue;
      this.entities.delete(id);
      if (entity.kind === "bullet") this.bulletPool.release(entity);
    }
  }

  /**
   * Live entities by reference, in a reused array — what the binary encoder
   * and the bots need each tick. Valid until the next call.
   */
  liveEntities(): readonly Entity[] {
    const out = this.#liveEntities;
    let count = 0;
    for (const entity of this.entities.values()) out[count++] = entity;
    // Shrinking to a non-zero length trims in place; `length = 0` followed by
    // push() would drop and re-allocate the backing store every tick.
    if (out.length !== count) out.length = count;
    return out;
  }

  addScore(playerId: EntityId, points: number): void {
    this.scores.set(playerId, (this.scores.get(playerId) ?? 0) + points);
  }

  snapshot(): Snapshot {
    const entities = [...this.entities.values()].map(toSnapshotEntity);
    const scores: Record<string, number> = {};
    for (const [id, score] of this.scores) scores[String(id)] = score;
    return { version: 1, tick: this.tick, time: this.time, entities, scores };
  }
}

function toSnapshotEntity(entity: Entity): SnapshotEntity {
  const base = {
    id: entity.id,
    x: entity.x,
    y: entity.y,
    vx: entity.vx,
    vy: entity.vy,
    angle: entity.angle,
    radius: entity.radius,
    alive: entity.alive,
  };
  switch (entity.kind) {
    case "ship":
      return { ...base, kind: "ship", hp: entity.hp, maxHp: entity.maxHp };
    case "bullet":
      return {
        ...base,
        kind: "bullet",
        ownerId: entity.ownerId,
        ttl: entity.ttl,
        homing: entity.homing,
      };
    case "asteroid":
      return {
        ...base,
        kind: "asteroid",
        homing: entity.homing,
        variant: entity.variant,
      };
    case "pickup":
      return { ...base, kind: "pickup", variant: entity.variant };
    default:
      return assertNever(entity);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled entity kind: ${JSON.stringify(value)}`);
}

export type { Broadphase };

export function deterministicSeed(roomId: string, salt = 0): number {
  return (seedFromString(roomId) ^ (salt >>> 0)) >>> 0;
}

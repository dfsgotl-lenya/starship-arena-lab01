import { mulberry32, seedFromString } from "./prng.ts";
import { createAsteroid, createBullet, createShip } from "./entity.ts";
import { integrate } from "./integrate.ts";
import { resolveCollisions } from "./collision.ts";
import { entityId, tickNumber } from "../types.ts";
import type {
  ArenaConfig,
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
}
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

  constructor({
    width = 960,
    height = 600,
    seed = 1,
    arena = {},
  }: WorldOptions = {}) {
    this.width = width;
    this.height = height;
    this.seed = seed >>> 0;
    this.arena = { ...arena };
  }

  add<T extends Entity>(entity: T): T {
    this.entities.set(entity.id, entity);
    return entity;
  }

  remove(id: EntityId): void {
    this.entities.delete(id);
  }

  addShip(id: EntityId, x = this.width / 2, y = this.height / 2) {
    const ship = createShip(id, x, y);
    this.scores.set(id, this.scores.get(id) ?? 0);
    return this.add(ship);
  }

  spawnBullet(ownerId: EntityId, ship: Parameters<typeof createBullet>[2]) {
    const bullet = createBullet(entityId(this.nextId++), ownerId, ship);
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
          entityId(this.nextId++),
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
    inputs: ReadonlyMap<EntityId, InputState> = new Map(),
  ): void {
    this.time += dt;
    this.tick = tickNumber(Number(this.tick) + 1);
    this.events = [];
    for (const entity of this.entities.values()) {
      if (!entity.alive) continue;
      if (entity.kind === "ship") {
        const input = inputs.get(entity.id) ?? {
          thrust: false,
          turn: 0,
          fire: false,
        };
        const next = integrate(entity, input, dt);
        Object.assign(entity, next);
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
      wrap(entity, this.width, this.height);
    }
    resolveCollisions(this);
    this.#sweep();
    this.#processRespawns();
  }

  scheduleRespawn(playerId: EntityId): void {
    this.respawns.push({ playerId, at: this.time + 2 });
  }

  #processRespawns(): void {
    const remaining: RespawnEntry[] = [];
    for (const entry of this.respawns) {
      if (entry.at > this.time) {
        remaining.push(entry);
        continue;
      }
      const ship = this.addShip(
        entry.playerId,
        this.width / 2,
        this.height / 2,
      );
      this.events.push({ type: "respawned", playerId: ship.id });
    }
    this.respawns = remaining;
  }

  #sweep(): void {
    for (const [id, entity] of this.entities)
      if (!entity.alive) this.entities.delete(id);
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

function wrap(entity: Entity, width: number, height: number): void {
  if (entity.x < 0) entity.x += width;
  if (entity.x >= width) entity.x -= width;
  if (entity.y < 0) entity.y += height;
  if (entity.y >= height) entity.y -= height;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled entity kind: ${JSON.stringify(value)}`);
}

export function deterministicSeed(roomId: string, salt = 0): number {
  return (seedFromString(roomId) ^ (salt >>> 0)) >>> 0;
}

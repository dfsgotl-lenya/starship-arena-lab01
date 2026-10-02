import { mulberry32, seedFromString } from "./prng.js";
import { createAsteroid, createBullet, createShip } from "./entity.js";
import { integrate } from "./integrate.js";
import { resolveCollisions } from "./collision.js";

export class World {
  constructor({ width = 960, height = 600, seed = 1, arena = {} } = {}) {
    this.width = width;
    this.height = height;
    this.seed = seed >>> 0;
    this.arena = { ...arena };
    this.time = 0;
    this.tick = 0;
    this.nextId = 1;
    this.entities = new Map();
    this.scores = new Map();
    this.events = [];
    this.respawns = [];
  }

  add(entity) {
    this.entities.set(entity.id, entity);
    return entity;
  }

  remove(id) {
    this.entities.delete(id);
  }

  addShip(id, x = this.width / 2, y = this.height / 2) {
    const ship = createShip(id, x, y);
    this.scores.set(id, this.scores.get(id) ?? 0);
    return this.add(ship);
  }

  spawnBullet(ownerId, ship) {
    const bullet = createBullet(this.nextId++, ownerId, ship);
    return this.add(bullet);
  }

  reset(seed = this.seed) {
    this.seed = seed >>> 0;
    this.time = 0;
    this.tick = 0;
    this.nextId = 1;
    this.entities.clear();
    this.events = [];
    this.respawns = [];
  }

  seedArena(config = this.arena) {
    this.arena = { ...config };
    const rng = mulberry32(this.seed);
    const count = config.asteroidCount ?? 8;
    const homingEvery = config.homingEvery ?? 4;
    const minSpeed = config.asteroidSpeedMin ?? 30;
    const maxSpeed = config.asteroidSpeedMax ?? 80;
    for (let index = 0; index < count; index += 1) {
      let x;
      let y;
      do {
        x = 50 + rng() * Math.max(1, this.width - 100);
        y = 50 + rng() * Math.max(1, this.height - 100);
      } while (Math.hypot(x - this.width / 2, y - this.height / 2) < 140);
      const angle = rng() * Math.PI * 2;
      const speed = minSpeed + rng() * (maxSpeed - minSpeed);
      const radius = 22 + rng() * 18;
      this.add(
        createAsteroid(
          this.nextId++,
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

  step(dt, inputs = new Map()) {
    this.time += dt;
    this.tick += 1;
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
      }
      wrap(entity, this.width, this.height);
    }
    resolveCollisions(this);
    this.#sweep();
    this.#processRespawns();
  }

  scheduleRespawn(playerId) {
    this.respawns.push({ playerId, at: this.time + 2 });
  }

  #processRespawns() {
    const remaining = [];
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

  #sweep() {
    for (const [id, entity] of this.entities)
      if (!entity.alive) this.entities.delete(id);
  }

  addScore(playerId, points) {
    this.scores.set(playerId, (this.scores.get(playerId) ?? 0) + points);
  }

  snapshot() {
    return {
      version: 1,
      tick: this.tick,
      time: this.time,
      entities: [...this.entities.values()].map(
        ({
          id,
          kind,
          ownerId,
          x,
          y,
          vx,
          vy,
          angle,
          hp,
          radius,
          ttl,
          homing,
          variant,
          alive,
        }) => ({
          id,
          kind,
          ownerId: ownerId ?? 0,
          x,
          y,
          vx,
          vy,
          angle: angle ?? 0,
          hp: hp ?? 0,
          radius: radius ?? 0,
          ttl: ttl ?? 0,
          homing: Boolean(homing),
          variant: variant ?? 0,
          alive: Boolean(alive),
        }),
      ),
      scores: Object.fromEntries(this.scores),
    };
  }
}

function wrap(entity, width, height) {
  if (entity.x < 0) entity.x += width;
  if (entity.x >= width) entity.x -= width;
  if (entity.y < 0) entity.y += height;
  if (entity.y >= height) entity.y -= height;
}

export function deterministicSeed(roomId, salt = 0) {
  return (seedFromString(roomId) ^ (salt >>> 0)) >>> 0;
}

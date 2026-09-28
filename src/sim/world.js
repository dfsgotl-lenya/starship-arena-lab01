import { Ship } from "./ship.js";
import { Asteroid } from "./asteroid.js";
import { Pickup } from "./pickup.js";
import { Explosion } from "./explosion.js";
import { resolveCollisions } from "./collision.js";

export class World {
  #entities = new Map();

  constructor({ width = 800, height = 600, onScore = () => {} } = {}) {
    this.width = width;
    this.height = height;
    this.time = 0;
    this.score = 0;
    this.playerId = null;
    this.playerShip = null;
    this.onScore = onScore;
    this.#respawns = [];
    this.bulletHomingEnabled = true;
  }

  #respawns;

  spawn(entity) {
    entity.prevPos = entity.pos.clone();
    entity.prevAngle = entity.angle;
    this.#entities.set(entity.id, entity);
    if (entity.kind === "ship" && this.playerId === null) {
      this.playerId = entity.id;
      this.playerShip = entity;
    }
    return entity;
  }

  despawn(id) {
    const entity = this.#entities.get(id);
    if (entity) entity.alive = false;
  }

  get(id) {
    return this.#entities.get(id);
  }

  *[Symbol.iterator]() {
    yield* this.#entities.values();
  }

  *ofKind(kind) {
    for (const entity of this) {
      if (entity.kind === kind && entity.alive) yield entity;
    }
  }

  step(dt, context) {
    this.time += dt;
    const frameContext = { ...context, world: this, width: this.width, height: this.height };

    for (const entity of this.#entities.values()) {
      if (!entity.alive) continue;
      entity.capturePrevious();
      entity.update(dt, frameContext);
    }

    resolveCollisions(this);
    this.#sweepDead();
    this.#processRespawns();
  }

  #sweepDead() {
    for (const [id, entity] of this.#entities) {
      if (!entity.alive) {
        if (entity.id === this.playerId) this.playerShip = null;
        this.#entities.delete(id);
      }
    }
  }

  destroyShip(ship) {
    if (!ship.alive) return;
    ship.alive = false;
    this.#respawns.push({ at: this.time + 2, x: this.width / 2, y: this.height / 2 });
    if (this.playerId === ship.id) this.playerShip = null;
    this.addScore(-5);
  }

  #processRespawns() {
    const ready = this.#respawns.filter((entry) => entry.at <= this.time);
    this.#respawns = this.#respawns.filter((entry) => entry.at > this.time);
    for (const entry of ready) {
      const spawnPoint = this.#findSafeSpawn(entry.x, entry.y);
      const ship = new Ship(spawnPoint.x, spawnPoint.y);
      this.spawn(ship);
      this.playerId = ship.id;
      this.playerShip = ship;
    }
  }

  #findSafeSpawn(x, y) {
    const occupied = [...this.#entities.values()].filter((entity) => entity.alive && entity.kind === "asteroid");
    const candidates = [
      { x, y },
      { x: this.width * 0.25, y: this.height * 0.5 },
      { x: this.width * 0.75, y: this.height * 0.5 },
      { x: this.width * 0.5, y: this.height * 0.25 },
      { x: this.width * 0.5, y: this.height * 0.75 },
    ];
    return candidates.find((candidate) =>
      occupied.every((asteroid) => {
        const dx = asteroid.pos.x - candidate.x;
        const dy = asteroid.pos.y - candidate.y;
        return dx * dx + dy * dy > (asteroid.radius + 70) ** 2;
      }),
    ) ?? candidates[0];
  }

  addScore(points) {
    this.score += points;
    this.onScore(this.score);
  }

  spawnExplosion(x, y, options = {}) {
    this.spawn(new Explosion(x, y));
    if (options.sparkOnly) this.addScore(1);
  }

  reset() {
    this.#entities.clear();
    this.#respawns = [];
    this.time = 0;
    this.score = 0;
    this.playerId = null;
    this.playerShip = null;
  }

  seed() {
    const count = 9;
    for (let i = 0; i < count; i += 1) {
      let x = 0;
      let y = 0;
      do {
        x = 50 + Math.random() * (this.width - 100);
        y = 50 + Math.random() * (this.height - 100);
      } while (Math.hypot(x - this.width / 2, y - this.height / 2) < 140);

      const speed = 35 + Math.random() * 50;
      const angle = Math.random() * Math.PI * 2;
      const asteroid = new Asteroid(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 20 + Math.random() * 15, i % 4 === 0);
      this.spawn(asteroid);
    }

    this.spawn(new Pickup(this.width * 0.25, this.height * 0.25, "shield"));
    this.spawn(new Pickup(this.width * 0.75, this.height * 0.75, "rapid"));
  }
}

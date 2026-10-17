import type {
  AsteroidEntity,
  BulletEntity,
  Entity,
  ShipEntity,
} from "../types.ts";
import { SpatialHash } from "./spatial-hash.ts";

export type Broadphase = "naive" | "hash";
type Target = ShipEntity | AsteroidEntity;

/** The part of World the collision system needs (keeps this module testable). */
export interface CollisionWorld {
  readonly width: number;
  readonly height: number;
  readonly entities: ReadonlyMap<unknown, Entity>;
  readonly events: { push(event: CollisionEvent): unknown };
  addScore(playerId: BulletEntity["ownerId"], points: number): void;
  scheduleRespawn(playerId: ShipEntity["id"]): void;
}
type CollisionEvent =
  | {
      readonly type: "hit";
      readonly targetId: Target["id"];
      readonly ownerId: BulletEntity["ownerId"];
    }
  | { readonly type: "exploded"; readonly targetId: Target["id"] };

/**
 * Bullet-vs-ship/asteroid collisions.
 *
 * Both broad phases visit bullets in entity order and, for each bullet, the
 * candidate targets in entity order, so "naive" and "hash" give bit-identical
 * worlds (checked by a fast-check property). All scratch arrays are reused.
 */
export class CollisionSystem {
  broadphase: Broadphase;
  readonly #bullets: BulletEntity[] = [];
  readonly #targets: Target[] = [];
  readonly #candidates: Target[] = [];
  readonly #order = new Map<Target, number>();
  readonly #hash: SpatialHash<Target>;
  checks = 0;

  constructor(width: number, height: number, broadphase: Broadphase = "hash") {
    this.broadphase = broadphase;
    this.#hash = new SpatialHash<Target>(width, height, 64);
  }

  resolve(world: CollisionWorld): void {
    // Count-based scratch arrays: they only grow, never `length = 0`.
    const bullets = this.#bullets;
    const targets = this.#targets;
    let bulletCount = 0;
    let targetCount = 0;
    for (const entity of world.entities.values()) {
      if (!entity.alive) continue;
      if (entity.kind === "bullet") bullets[bulletCount++] = entity;
      else if (entity.kind === "ship" || entity.kind === "asteroid")
        targets[targetCount++] = entity;
    }
    this.checks = 0;
    if (bulletCount === 0 || targetCount === 0) return;

    if (this.broadphase === "naive") {
      for (let b = 0; b < bulletCount; b += 1)
        this.#test(world, bullets[b]!, targets, targetCount);
      return;
    }

    const hash = this.#hash;
    const order = this.#order;
    hash.clear();
    order.clear();
    for (let index = 0; index < targetCount; index += 1) {
      const target = targets[index]!;
      order.set(target, index);
      hash.insert(target);
    }
    const candidates = this.#candidates;
    for (let b = 0; b < bulletCount; b += 1) {
      const bullet = bullets[b]!;
      // Targets are inserted into every cell their circle touches, so two
      // overlapping circles always share at least one cell.
      const found = hash.query(bullet.x, bullet.y, bullet.radius, candidates);
      sortByOrder(candidates, found, order);
      this.#test(world, bullet, candidates, found);
    }
  }

  #test(
    world: CollisionWorld,
    bullet: BulletEntity,
    targets: readonly Target[],
    count: number,
  ): void {
    for (let index = 0; index < count; index += 1) {
      const target = targets[index]!;
      if (!bullet.alive) return;
      if (!target.alive) continue;
      if (target.kind === "ship" && target.id === bullet.ownerId) continue;
      this.checks += 1;
      const dx = bullet.x - target.x;
      const dy = bullet.y - target.y;
      const radius = bullet.radius + target.radius;
      if (dx * dx + dy * dy > radius * radius) continue;

      bullet.alive = false;
      world.events.push({
        type: "hit",
        targetId: target.id,
        ownerId: bullet.ownerId,
      });
      if (target.kind === "asteroid") {
        target.alive = false;
        world.addScore(bullet.ownerId, 10);
      } else {
        target.hp = Math.max(0, target.hp - 25);
        if (target.hp === 0) {
          target.alive = false;
          world.scheduleRespawn(target.id);
          world.addScore(bullet.ownerId, 50);
          world.events.push({ type: "exploded", targetId: target.id });
        }
      }
    }
  }
}

/** Insertion sort: candidate lists are tiny and usually almost sorted. */
function sortByOrder(
  items: Target[],
  count: number,
  order: ReadonlyMap<Target, number>,
): void {
  for (let i = 1; i < count; i += 1) {
    const item = items[i]!;
    const key = order.get(item) ?? 0;
    let j = i - 1;
    while (j >= 0 && (order.get(items[j]!) ?? 0) > key) {
      items[j + 1] = items[j]!;
      j -= 1;
    }
    items[j + 1] = item;
  }
}

/** Backwards-compatible helper used by Lab 5/6 code and tests. */
export function resolveCollisions(
  world: CollisionWorld & { readonly collisions?: CollisionSystem },
  broadphase?: Broadphase,
): void {
  const system =
    world.collisions ?? new CollisionSystem(world.width, world.height);
  if (broadphase) system.broadphase = broadphase;
  system.resolve(world);
}

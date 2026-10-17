import { describe, expect, test } from "vitest";
import { CollisionSystem, resolveCollisions } from "../sim/collision.ts";
import { createAsteroid, createBullet } from "../sim/entity.ts";
import { SpatialHash } from "../sim/spatial-hash.ts";
import { entityId } from "../types.ts";
import { emptyWorld } from "./fixtures.ts";

function bulletAt(
  world: ReturnType<typeof emptyWorld>,
  owner: number,
  x: number,
  y: number,
) {
  const bullet = createBullet(entityId(world.nextId++), entityId(owner), {
    x,
    y,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 0,
  });
  bullet.x = x;
  bullet.y = y;
  return world.add(bullet);
}

describe("collisions", () => {
  test("a bullet destroys an asteroid and scores 10", () => {
    const world = emptyWorld();
    const shooter = world.addShip(entityId(world.nextId++), 50, 50);
    const rock = world.add(
      createAsteroid(entityId(world.nextId++), 300, 300, 0, 0, 30),
    );
    const bullet = bulletAt(world, shooter.id, 310, 300);
    resolveCollisions(world);
    expect(rock.alive).toBe(false);
    expect(bullet.alive).toBe(false);
    expect(world.scores.get(shooter.id)).toBe(10);
    expect(world.events).toContainEqual({
      type: "hit",
      targetId: rock.id,
      ownerId: shooter.id,
    });
  });

  test("a bullet never hits its own ship", () => {
    const world = emptyWorld();
    const shooter = world.addShip(entityId(world.nextId++), 200, 200);
    const bullet = bulletAt(world, shooter.id, 200, 200);
    resolveCollisions(world);
    expect(bullet.alive).toBe(true);
    expect(shooter.hp).toBe(100);
  });

  test("a hit ship loses 25 hp", () => {
    const world = emptyWorld();
    const a = world.addShip(entityId(world.nextId++), 50, 50);
    const b = world.addShip(entityId(world.nextId++), 400, 400);
    bulletAt(world, a.id, 400, 405);
    resolveCollisions(world);
    expect(b.hp).toBe(75);
    expect(b.alive).toBe(true);
  });

  test("a ship at 0 hp explodes, schedules a respawn and gives 50 points", () => {
    const world = emptyWorld();
    const a = world.addShip(entityId(world.nextId++), 50, 50);
    const b = world.addShip(entityId(world.nextId++), 400, 400);
    b.hp = 25;
    bulletAt(world, a.id, 400, 400);
    resolveCollisions(world);
    expect(b.alive).toBe(false);
    expect(world.respawns).toHaveLength(1);
    expect(world.scores.get(a.id)).toBe(50);
    expect(world.events.at(-1)).toEqual({ type: "exploded", targetId: b.id });
  });

  test("a bullet far from every target hits nothing", () => {
    const world = emptyWorld();
    const rock = world.add(
      createAsteroid(entityId(world.nextId++), 100, 100, 0, 0, 30),
    );
    const bullet = bulletAt(world, 99, 600, 500);
    resolveCollisions(world);
    expect(rock.alive && bullet.alive).toBe(true);
  });

  test("one bullet hits only one target; a later bullet still checks remaining targets", () => {
    const world = emptyWorld();
    const first = world.add(
      createAsteroid(entityId(world.nextId++), 300, 300, 0, 0, 30),
    );
    const second = world.add(
      createAsteroid(entityId(world.nextId++), 320, 300, 0, 0, 30),
    );
    bulletAt(world, 99, 310, 300);
    bulletAt(world, 99, 310, 300);
    resolveCollisions(world);
    // Lab 6 used `break` when a target was dead, so the 2nd bullet skipped `second`.
    expect(first.alive).toBe(false);
    expect(second.alive).toBe(false);
  });

  test("hash and naive broad phases produce the same result", () => {
    const build = (broadphase: "hash" | "naive") => {
      const world = emptyWorld();
      world.collisions.broadphase = broadphase;
      for (let i = 0; i < 30; i += 1)
        world.add(
          createAsteroid(
            entityId(world.nextId++),
            (i * 97) % 960,
            (i * 53) % 600,
            0,
            0,
            25,
          ),
        );
      for (let i = 0; i < 60; i += 1)
        bulletAt(world, 900, (i * 61) % 960, (i * 37) % 600);
      world.collisions.resolve(world);
      return [...world.entities.values()]
        .map((e) => `${e.id}:${e.alive}`)
        .join(",");
    };
    expect(build("hash")).toBe(build("naive"));
  });

  test("the spatial hash checks far fewer pairs than all-vs-all", () => {
    const world = emptyWorld();
    for (let i = 0; i < 100; i += 1)
      world.add(
        createAsteroid(
          entityId(world.nextId++),
          (i * 97) % 960,
          (i * 53) % 600,
          0,
          0,
          20,
        ),
      );
    for (let i = 0; i < 200; i += 1)
      bulletAt(world, 900, (i * 61) % 960, (i * 37) % 600);
    const naive = new CollisionSystem(960, 600, "naive");
    const hash = new CollisionSystem(960, 600, "hash");
    // Count candidate checks on identical copies (resolve mutates alive flags).
    const snapshotAlive = [...world.entities.values()].map((e) => e.alive);
    naive.resolve(world);
    [...world.entities.values()].forEach(
      (e, i) => (e.alive = snapshotAlive[i]!),
    );
    hash.resolve(world);
    expect(hash.checks).toBeLessThan(naive.checks / 5);
  });
});

describe("SpatialHash", () => {
  test("query returns items in touched cells only", () => {
    const hash = new SpatialHash<{
      x: number;
      y: number;
      radius: number;
      name: string;
    }>(640, 640, 64);
    const near = { x: 100, y: 100, radius: 10, name: "near" };
    const far = { x: 600, y: 600, radius: 10, name: "far" };
    hash.insert(near);
    hash.insert(far);
    const out: (typeof near)[] = [];
    const found = hash.query(110, 110, 5, out);
    expect(out.slice(0, found).map((i) => i.name)).toEqual(["near"]);
  });

  test("an item spanning several cells is returned once", () => {
    const hash = new SpatialHash<{ x: number; y: number; radius: number }>(
      640,
      640,
      64,
    );
    const big = { x: 64, y: 64, radius: 40 };
    hash.insert(big);
    const out: (typeof big)[] = [];
    expect(hash.query(64, 64, 60, out)).toBe(1);
    expect(out[0]).toBe(big);
  });

  test("clear empties every used cell without shrinking the buckets", () => {
    const hash = new SpatialHash<{ x: number; y: number; radius: number }>(
      640,
      640,
      64,
    );
    hash.insert({ x: 5, y: 5, radius: 1 });
    hash.clear();
    expect(hash.query(5, 5, 1, [])).toBe(0);
    const again = { x: 6, y: 6, radius: 1 };
    hash.insert(again);
    const out: (typeof again)[] = [];
    expect(hash.query(5, 5, 1, out)).toBe(1);
    expect(out[0]).toBe(again);
  });

  test("positions outside the grid are clamped to edge cells", () => {
    const hash = new SpatialHash<{ x: number; y: number; radius: number }>(
      128,
      128,
      64,
    );
    const item = { x: -10, y: 500, radius: 1 };
    hash.insert(item);
    const out: (typeof item)[] = [];
    expect(hash.query(0, 127, 1, out)).toBe(1);
  });
});

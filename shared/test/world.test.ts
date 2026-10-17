import { describe, expect, test } from "vitest";
import { World, deterministicSeed } from "../sim/world.ts";
import { entityId } from "../types.ts";
import type { EntityId, InputState } from "../types.ts";
import { emptyWorld, scriptedInput } from "./fixtures.ts";

function runScript(seed: number, steps: number) {
  const world = new World({ seed, arena: { asteroidCount: 6 } });
  world.seedArena();
  const a = world.addShip(world.allocateId(), 240, 300);
  const b = world.addShip(world.allocateId(), 720, 300);
  for (let step = 0; step < steps; step += 1) {
    const inputs = new Map<EntityId, InputState>([
      [a.id, scriptedInput(step)],
      [b.id, scriptedInput(step + 11)],
    ]);
    world.step(1 / 30, inputs);
  }
  return world;
}

describe("World", () => {
  test("seedArena is deterministic for the same seed", () => {
    const a = new World({ seed: 42 });
    const b = new World({ seed: 42 });
    a.seedArena();
    b.seedArena();
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  test("different seeds give different arenas", () => {
    const a = new World({ seed: 1 });
    const b = new World({ seed: 2 });
    a.seedArena();
    b.seedArena();
    expect(a.snapshot().entities).not.toEqual(b.snapshot().entities);
  });

  test("asteroids never spawn in the central safe zone", () => {
    const world = new World({ seed: 9, arena: { asteroidCount: 30 } });
    world.seedArena();
    for (const entity of world.entities.values())
      expect(Math.hypot(entity.x - 480, entity.y - 300)).toBeGreaterThanOrEqual(
        140,
      );
  });

  test("step determinism: same seed + same inputs → identical state after 600 ticks", () => {
    const a = runScript(1234, 600);
    const b = runScript(1234, 600);
    expect(a.snapshot()).toEqual(b.snapshot());
    expect([...a.scores]).toEqual([...b.scores]);
  });

  test("deterministicSeed depends on room id and salt", () => {
    expect(deterministicSeed("alpha")).toBe(deterministicSeed("alpha"));
    expect(deterministicSeed("alpha")).not.toBe(deterministicSeed("beta"));
    expect(deterministicSeed("alpha", 1)).not.toBe(
      deterministicSeed("alpha", 2),
    );
  });

  test("firing spawns a bullet and starts the cooldown", () => {
    const world = emptyWorld();
    const ship = world.addShip(world.allocateId(), 100, 100);
    world.step(
      1 / 30,
      new Map([[ship.id, { thrust: false, turn: 0, fire: true }]]),
    );
    const bullets = [...world.entities.values()].filter(
      (e) => e.kind === "bullet",
    );
    expect(bullets).toHaveLength(1);
    expect(ship.fireCooldown).toBeCloseTo(0.12);
    expect(world.events).toContainEqual({ type: "fired", ownerId: ship.id });
  });

  test("bullets expire after their ttl and return to the pool", () => {
    const world = emptyWorld();
    const ship = world.addShip(world.allocateId(), 100, 100);
    world.step(
      1 / 30,
      new Map([[ship.id, { thrust: false, turn: 0, fire: true }]]),
    );
    const available = world.bulletPool.available;
    for (let i = 0; i < 50; i += 1) world.step(1 / 30);
    expect([...world.entities.values()].some((e) => e.kind === "bullet")).toBe(
      false,
    );
    expect(world.bulletPool.available).toBe(available + 1);
  });

  test("pooled bullets are reused instead of allocated", () => {
    const world = emptyWorld();
    const ship = world.addShip(world.allocateId(), 100, 100);
    const fire = new Map<EntityId, InputState>([
      [ship.id, { thrust: false, turn: 1, fire: true }],
    ]);
    for (let i = 0; i < 600; i += 1) world.step(1 / 30, fire);
    expect(world.bulletPool.created).toBeLessThan(80);
    expect(world.bulletPool.reused).toBeGreaterThan(100);
  });

  test("entities wrap around the arena edges", () => {
    const world = emptyWorld();
    const ship = world.addShip(world.allocateId(), 959, 599);
    ship.vx = 300;
    ship.vy = 300;
    world.step(1 / 30);
    expect(ship.x).toBeLessThan(20);
    expect(ship.y).toBeLessThan(20);
  });

  test("a destroyed ship respawns in the centre after 2 seconds", () => {
    const world = emptyWorld();
    const id = world.allocateId();
    world.addShip(id, 100, 100).alive = false;
    world.scheduleRespawn(id);
    world.step(1 / 30);
    expect(world.entities.has(id)).toBe(false);
    let steps = 1;
    while (!world.entities.has(id) && steps < 200) {
      world.step(1 / 30);
      steps += 1;
    }
    expect(steps / 30).toBeCloseTo(2, 0);
    expect(world.entities.get(id)?.alive).toBe(true);
    expect(world.events).toContainEqual({ type: "respawned", playerId: id });
  });

  test("allocateId wraps after 65535 and skips ids that are still in use", () => {
    const world = emptyWorld();
    const kept = world.addShip(entityId(1));
    world.nextId = 0xffff;
    expect(world.allocateId()).toBe(0xffff);
    expect(world.allocateId()).toBe(2);
    expect(kept.id).toBe(1);
  });

  test("destroyed asteroids are refilled from the edge", () => {
    const world = new World({ seed: 3, arena: { asteroidCount: 3 } });
    world.seedArena();
    for (const entity of world.entities.values()) entity.alive = false;
    world.step(1 / 30);
    for (let i = 0; i < 60; i += 1) world.step(1 / 30);
    const asteroids = [...world.entities.values()].filter(
      (e) => e.kind === "asteroid",
    );
    expect(asteroids.length).toBeGreaterThanOrEqual(1);
  });

  test("snapshot exposes every kind with its own fields", () => {
    const world = new World({ seed: 5, arena: { asteroidCount: 1 } });
    world.seedArena();
    const ship = world.addShip(world.allocateId(), 100, 100);
    world.spawnBullet(ship.id, ship);
    const kinds = world
      .snapshot()
      .entities.map((e) => e.kind)
      .sort();
    expect(kinds).toEqual(["asteroid", "bullet", "ship"]);
    expect(world.liveEntities()).toHaveLength(3);
  });

  test("reset clears the world and restarts ticks", () => {
    const world = runScript(1, 10);
    world.reset(77);
    expect(world.entities.size).toBe(0);
    expect(Number(world.tick)).toBe(0);
    expect(world.seed).toBe(77);
  });

  test("remove returns a bullet to the pool", () => {
    const world = emptyWorld();
    const ship = world.addShip(world.allocateId());
    const bullet = world.spawnBullet(ship.id, ship);
    const before = world.bulletPool.available;
    world.remove(bullet.id);
    expect(world.bulletPool.available).toBe(before + 1);
  });
});

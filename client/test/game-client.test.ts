import { describe, expect, test } from "vitest";
import { World } from "@starship-arena/shared/sim/world.ts";
import { createAsteroid } from "@starship-arena/shared/sim/entity.ts";
import { entityId } from "@starship-arena/shared/types.ts";
import type { EntityId, InputState } from "@starship-arena/shared/types.ts";
import { NET_DT } from "../src/netcode/game-client.ts";
import { deliver, makeGame } from "./helpers.ts";

function serverWithShip() {
  const world = new World({ seed: 4, arena: { asteroidCount: 0 } });
  const ship = world.addShip(world.allocateId(), 300, 300);
  return { world, ship };
}

describe("NetworkGame prediction", () => {
  test("sends one input per 1/30 s with increasing seq", () => {
    const { game, sent } = makeGame();
    for (let i = 0; i < 60; i += 1) game.step(1 / 60);
    expect(sent).toHaveLength(30);
    expect(sent.map((p) => Number(p.seq))).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
    expect(game.pendingInputs).toHaveLength(30);
  });

  test("keys map to thrust and turn; Space queues a single shot", () => {
    const { game, sent, keys } = makeGame();
    keys.add("KeyW");
    keys.add("KeyA");
    game.fire();
    game.step(NET_DT);
    game.step(NET_DT);
    expect(sent[0]).toMatchObject({ thrust: true, turn: -1, fire: true });
    expect(sent[1]?.fire).toBe(false);
  });

  test("the first snapshot creates the predicted ship at the server position", () => {
    const { game } = makeGame();
    const { world, ship } = serverWithShip();
    game.shipId = ship.id;
    deliver(game, world);
    expect(game.localShip?.x).toBeCloseTo(300);
    expect(game.localShip?.id).toBe(ship.id);
  });

  test("reconciliation with the authoritative server keeps correction ≈ 0", () => {
    const { game, sent, keys, advance } = makeGame();
    const { world, ship } = serverWithShip();
    game.shipId = ship.id;
    deliver(game, world);
    keys.add("KeyW");
    let processed = 0;
    for (let tick = 0; tick < 90; tick += 1) {
      if (tick === 30) keys.add("KeyD");
      if (tick === 60) keys.delete("KeyW");
      game.step(NET_DT);
      advance(33);
      // Server runs 2 inputs behind (latency), then acks what it processed.
      if (sent.length - processed > 2) {
        const packet = sent[processed]!;
        world.step(NET_DT, new Map<EntityId, InputState>([[ship.id, packet]]));
        processed += 1;
        deliver(game, world, Number(packet.seq));
        expect(game.correction).toBeLessThan(0.05);
      }
    }
    expect(game.pendingInputs.length).toBeLessThanOrEqual(3);
  });

  test("acked inputs are dropped and recycled", () => {
    const { game } = makeGame();
    const { world, ship } = serverWithShip();
    game.shipId = ship.id;
    deliver(game, world);
    for (let i = 0; i < 10; i += 1) game.step(NET_DT);
    deliver(game, world, 7);
    expect(game.pendingInputs.map((p) => Number(p.seq))).toEqual([8, 9, 10]);
  });

  test("a misprediction produces a correction that is smoothed out over ~100 ms", () => {
    const { game } = makeGame();
    const { world, ship } = serverWithShip();
    game.shipId = ship.id;
    deliver(game, world);
    ship.x += 20; // server disagrees by 20 px
    deliver(game, world);
    expect(game.correction).toBeCloseTo(20, 0);
    for (let i = 0; i < 30; i += 1) game.step(1 / 60);
    expect(Math.abs(game.correctionOffset.x)).toBeLessThan(1);
  });

  test("firing predicts a local bullet that disappears once the server's bullet arrives", () => {
    const { game } = makeGame();
    const { world, ship } = serverWithShip();
    game.shipId = ship.id;
    deliver(game, world);
    game.fire();
    game.step(NET_DT);
    expect(game.localBullets).toHaveLength(1);
    world.step(
      NET_DT,
      new Map([[ship.id, { thrust: false, turn: 0, fire: true }]]),
    );
    deliver(game, world, 1);
    expect(game.localBullets).toHaveLength(0);
    expect(game.bulletPool.available).toBeGreaterThan(0);
  });
});

describe("NetworkGame rendering", () => {
  test("render() reuses the same list and entity objects every frame", () => {
    const { game, advance } = makeGame();
    const { world } = serverWithShip();
    world.add(createAsteroid(world.allocateId(), 100, 100, 10, 0, 30));
    deliver(game, world);
    advance(200);
    const first = game.render();
    const objects = [...first.entities];
    advance(16);
    const second = game.render();
    expect(second).toBe(first);
    expect(second.entities).toBe(first.entities);
    second.entities.forEach((entity, i) => expect(entity).toBe(objects[i]));
  });

  test("remote entities are interpolated between two snapshots", () => {
    const { game, advance } = makeGame();
    const world = new World({ seed: 1, arena: { asteroidCount: 0 } });
    const rock = world.add(createAsteroid(entityId(5), 100, 100, 0, 0, 30));
    deliver(game, world);
    advance(100);
    rock.x = 200;
    deliver(game, world);
    game.setInterpolationDelay(50); // render at t = 50, halfway between 0 and 100
    const entity = game.render(100).entities.find((e) => e.id === 5);
    expect(entity?.x).toBeCloseTo(150);
  });

  test("the local ship is drawn from prediction, not from the remote snapshot", () => {
    const { game } = makeGame();
    const { world, ship } = serverWithShip();
    game.shipId = ship.id;
    deliver(game, world);
    const ships = game.render().entities.filter((e) => e.kind === "ship");
    expect(ships).toHaveLength(1);
    expect(ships[0]?.local).toBe(true);
  });

  test("onDestroyed reports asteroids that vanish between snapshots", () => {
    const { game } = makeGame();
    const world = new World({ seed: 1, arena: { asteroidCount: 0 } });
    world.add(createAsteroid(entityId(9), 123, 45, 0, 0, 30));
    const destroyed: Array<[number, number, string]> = [];
    game.onDestroyed = (x, y, kind) => destroyed.push([x, y, kind]);
    deliver(game, world);
    world.remove(entityId(9));
    deliver(game, world);
    expect(destroyed).toEqual([[123, 45, "asteroid"]]);
  });

  test("the snapshot ring keeps working after it wraps around", () => {
    const { game, advance } = makeGame();
    const world = new World({ seed: 1, arena: { asteroidCount: 0 } });
    const rock = world.add(createAsteroid(entityId(5), 0, 100, 0, 0, 30));
    for (let i = 0; i < 40; i += 1) {
      rock.x = i * 10;
      deliver(game, world);
      advance(33);
    }
    const entity = game
      .render(game.lastSnapshotAt)
      .entities.find((e) => e.id === 5);
    expect(entity?.x).toBeGreaterThan(300);
    expect(game.netStats().snapshotAge).toBeGreaterThanOrEqual(0);
  });
});

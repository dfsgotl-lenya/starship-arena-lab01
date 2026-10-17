import { describe, expect, test } from "vitest";
import { integrateInPlace, wrapPosition } from "../sim/integrate.ts";
import { createShip } from "../sim/entity.ts";
import { decodeSnapshot, encodeSnapshot } from "../codec/binary.ts";
import { World } from "../sim/world.ts";
import { sequenceNumber } from "../types.ts";
import type { EntityId, InputState, ShipEntity } from "../types.ts";
import { scriptedInput } from "./fixtures.ts";

const DT = 1 / 30;

/** What the client does: predict with the same shared integrate + wrap. */
function predict(ship: ShipEntity, inputs: readonly InputState[]): ShipEntity {
  const copy = { ...ship };
  for (const input of inputs) {
    integrateInPlace(copy, input, DT, copy);
    wrapPosition(copy, 960, 600);
  }
  return copy;
}

describe("client prediction vs authoritative server", () => {
  test("prediction equals the server world exactly (no collisions)", () => {
    const world = new World({ seed: 1, arena: { asteroidCount: 0 } });
    const ship = world.addShip(world.allocateId(), 300, 300);
    const start = { ...ship };
    const inputs = Array.from({ length: 300 }, (_, i) => ({
      ...scriptedInput(i),
      fire: false,
    }));
    for (const input of inputs)
      world.step(DT, new Map<EntityId, InputState>([[ship.id, input]]));
    const predicted = predict(start, inputs);
    expect(predicted.x).toBe(ship.x);
    expect(predicted.y).toBe(ship.y);
    expect(predicted.angle).toBe(ship.angle);
  });

  test("reconciliation from a binary snapshot + replay stays within 0.05 px", () => {
    const world = new World({ seed: 1, arena: { asteroidCount: 0 } });
    const ship = world.addShip(world.allocateId(), 480, 300);
    const inputs = Array.from({ length: 90 }, (_, i) => ({
      ...scriptedInput(i),
      fire: false,
    }));
    // Server has processed the first 60 inputs and sends a snapshot.
    for (const input of inputs.slice(0, 60))
      world.step(DT, new Map([[ship.id, input]]));
    const frame = encodeSnapshot(world.snapshot(), sequenceNumber(60), 0);
    const net = decodeSnapshot(frame).entities.find((e) => e.id === ship.id);
    if (net?.kind !== "ship") throw new Error("ship missing");
    // Client rebuilds from the (float32, angle/1000) snapshot and replays 30 pending inputs.
    const rebuilt = {
      ...createShip(ship.id, net.x, net.y),
      vx: net.vx,
      vy: net.vy,
      angle: net.angle,
    };
    const reconciled = predict(rebuilt, inputs.slice(60));
    for (const input of inputs.slice(60))
      world.step(DT, new Map([[ship.id, input]]));
    expect(
      Math.hypot(reconciled.x - ship.x, reconciled.y - ship.y),
    ).toBeLessThan(0.05);
  });

  test("breaking determinism on the client makes prediction diverge", () => {
    const world = new World({ seed: 1, arena: { asteroidCount: 0 } });
    const ship = world.addShip(world.allocateId(), 480, 300);
    const start = { ...ship };
    const noisy = { ...start };
    for (let i = 0; i < 120; i += 1) {
      const input = { ...scriptedInput(i), fire: false };
      world.step(DT, new Map([[ship.id, input]]));
      integrateInPlace(noisy, input, DT, noisy, true);
      wrapPosition(noisy, 960, 600);
    }
    expect(Math.hypot(noisy.x - ship.x, noisy.y - ship.y)).toBeGreaterThan(
      0.001,
    );
  });
});

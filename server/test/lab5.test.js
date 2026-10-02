import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeInput,
  decodeInput,
  encodeSnapshot,
  decodeSnapshot,
} from "@starship-arena/shared/codec/binary.js";
import { World } from "@starship-arena/shared/sim/world.js";
import { integrate } from "@starship-arena/shared/sim/integrate.js";

test("binary input round-trip", () => {
  const input = { seq: 42, tick: 100, thrust: true, turn: -1, fire: true };
  assert.deepEqual(decodeInput(encodeInput(input)), input);
});

test("binary snapshot round-trip keeps quantized angle", () => {
  const snapshot = {
    tick: 10,
    entities: [
      {
        id: 1,
        kind: "ship",
        ownerId: 1,
        x: 10.5,
        y: 20.25,
        vx: 1,
        vy: 2,
        angle: 0.3214,
        hp: 90,
        alive: true,
      },
    ],
  };
  const decoded = decodeSnapshot(encodeSnapshot(snapshot, 7, 50));
  assert.equal(decoded.lastProcessedSeq, 7);
  assert.equal(decoded.score, 50);
  assert.ok(Math.abs(decoded.entities[0].angle - 0.321) < 0.001);
});

test("shared sim has no DOM requirement", () => {
  const world = new World({ width: 800, height: 500, seed: 123 });
  world.addShip(1, 100, 100);
  const first = world.entities.get(1);
  const second = integrate(
    first,
    { thrust: true, turn: 1, fire: false },
    1 / 30,
  );
  assert.equal(typeof window, "undefined");
  assert.notEqual(second.x, first.x);
});

test("same input and seed produce same state", () => {
  const a = new World({
    width: 800,
    height: 500,
    seed: 99,
    arena: { asteroidCount: 4 },
  });
  const b = new World({
    width: 800,
    height: 500,
    seed: 99,
    arena: { asteroidCount: 4 },
  });
  a.seedArena(a.arena);
  b.seedArena(b.arena);
  a.addShip(1);
  b.addShip(1);
  for (let i = 0; i < 30; i += 1) {
    const input = new Map([
      [1, { thrust: true, turn: i % 2 ? 1 : 0, fire: i % 5 === 0 }],
    ]);
    a.step(1 / 30, input);
    b.step(1 / 30, input);
  }
  assert.deepEqual(a.snapshot().entities, b.snapshot().entities);
});

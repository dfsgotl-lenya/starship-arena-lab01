import { describe, expect, test } from "vitest";
import {
  copyShip,
  integrate,
  integrateInPlace,
  wrapPosition,
} from "../sim/integrate.ts";
import { Vector2 } from "../sim/vector.ts";
import { IDLE, ship } from "./fixtures.ts";
import type { InputState, ShipEntity } from "../types.ts";

const DT = 1 / 30;

/** The Lab 6 implementation (immutable Vector2), kept as an oracle. */
function legacyIntegrate(s: ShipEntity, input: InputState, dt: number) {
  const turn = Math.max(-1, Math.min(1, input.turn));
  let angle = s.angle + turn * s.turnSpeed * dt;
  if (angle > Math.PI) angle -= Math.PI * 2;
  if (angle < -Math.PI) angle += Math.PI * 2;
  let velocity = new Vector2(s.vx, s.vy);
  if (input.thrust)
    velocity = velocity.add(
      Vector2.fromAngle(angle, s.thrustAcceleration * dt),
    );
  velocity = velocity.scale(Math.pow(s.drag, dt * 60));
  if (velocity.length() > s.maxSpeed)
    velocity = velocity.normalize().scale(s.maxSpeed);
  return {
    angle,
    vx: velocity.x,
    vy: velocity.y,
    x: s.x + velocity.x * dt,
    y: s.y + velocity.y * dt,
  };
}

describe("integrate", () => {
  test("without input the ship drifts and drag slows it down", () => {
    const next = integrate(ship({ vx: 100 }), IDLE, DT);
    expect(next.vx).toBeLessThan(100);
    expect(next.vx).toBeCloseTo(100 * 0.992 ** 2, 10);
    expect(next.x).toBeCloseTo(100 + next.vx * DT);
    expect(next.y).toBe(100);
  });

  test("thrust accelerates along the heading", () => {
    const right = integrate(ship(), { ...IDLE, thrust: true }, DT);
    expect(right.vx).toBeGreaterThan(0);
    expect(right.vy).toBeCloseTo(0);
    const down = integrate(
      ship({ angle: Math.PI / 2 }),
      { ...IDLE, thrust: true },
      DT,
    );
    expect(down.vy).toBeGreaterThan(0);
    expect(Math.abs(down.vx)).toBeLessThan(1e-9);
  });

  test("turning changes the angle by turnSpeed·dt", () => {
    const next = integrate(ship(), { ...IDLE, turn: 1 }, DT);
    expect(next.angle).toBeCloseTo(3.4 * DT);
    expect(integrate(ship(), { ...IDLE, turn: -1 }, DT).angle).toBeCloseTo(
      -3.4 * DT,
    );
  });

  test("angle wraps into [-π, π]", () => {
    const next = integrate(
      ship({ angle: Math.PI - 0.01 }),
      { ...IDLE, turn: 1 },
      DT,
    );
    expect(next.angle).toBeLessThan(0);
    expect(next.angle).toBeGreaterThanOrEqual(-Math.PI);
  });

  test("speed is clamped to maxSpeed", () => {
    const next = integrate(
      ship({ vx: 5000, vy: 5000 }),
      { ...IDLE, thrust: true },
      DT,
    );
    expect(Math.hypot(next.vx, next.vy)).toBeCloseTo(420, 6);
  });

  test("fire cooldown counts down and never goes negative", () => {
    expect(
      integrate(ship({ fireCooldown: 0.1 }), IDLE, DT).fireCooldown,
    ).toBeCloseTo(0.1 - DT);
    expect(integrate(ship({ fireCooldown: 0.01 }), IDLE, DT).fireCooldown).toBe(
      0,
    );
  });

  test("integrate does not mutate its input", () => {
    const original = ship({ vx: 30 });
    const copy = { ...original };
    integrate(original, { thrust: true, turn: 1, fire: false }, DT);
    expect(original).toEqual(copy);
  });

  test("integrateInPlace writes into the same object and matches integrate", () => {
    const input: InputState = { thrust: true, turn: -1, fire: false };
    const a = ship({ vx: 12, vy: -3, angle: 0.4 });
    const expected = integrate(a, input, DT);
    const result = integrateInPlace(a, input, DT, a);
    expect(result).toBe(a);
    expect(a).toEqual(expected);
  });

  test("is bit-identical to the Lab 6 Vector2 implementation", () => {
    let current = ship({ vx: 40, vy: -20, angle: 1 });
    let legacy = { ...current };
    for (let step = 0; step < 200; step += 1) {
      const input: InputState = {
        thrust: step % 4 !== 0,
        turn: step % 9 < 3 ? -1 : step % 9 < 6 ? 0 : 1,
        fire: false,
      };
      const oracle = legacyIntegrate(legacy, input, DT);
      current = integrate(current, input, DT);
      legacy = { ...legacy, ...oracle };
      expect(current.x).toBe(legacy.x);
      expect(current.vy).toBe(legacy.vy);
    }
  });

  test("breakDeterminism adds client-only noise", () => {
    const a = integrate(ship({ vx: 10 }), IDLE, DT, { breakDeterminism: true });
    const b = integrate(ship({ vx: 10 }), IDLE, DT);
    expect(a.vx).not.toBe(b.vx);
  });

  test("copyShip copies every simulated field", () => {
    const target = ship();
    copyShip(target, ship({ x: 5, hp: 40, fireCooldown: 0.3 }));
    expect(target.x).toBe(5);
    expect(target.hp).toBe(40);
    expect(target.fireCooldown).toBe(0.3);
  });

  test("wrapPosition wraps all four edges", () => {
    const p = { x: -1, y: 601 };
    wrapPosition(p, 960, 600);
    expect(p).toEqual({ x: 959, y: 1 });
    const q = { x: 960, y: -0.5 };
    wrapPosition(q, 960, 600);
    expect(q).toEqual({ x: 0, y: 599.5 });
  });
});

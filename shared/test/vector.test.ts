import { describe, expect, test } from "vitest";
import { Vector2 } from "../sim/vector.ts";

describe("Vector2", () => {
  test("add and sub return new vectors without mutating the operands", () => {
    const a = new Vector2(1, 2);
    const b = new Vector2(3, -5);
    expect(a.add(b)).toEqual(new Vector2(4, -3));
    expect(a.sub(b)).toEqual(new Vector2(-2, 7));
    expect(a).toEqual(new Vector2(1, 2));
  });

  test("scale multiplies both components", () => {
    expect(new Vector2(2, -3).scale(1.5)).toEqual(new Vector2(3, -4.5));
  });

  test("length is the Euclidean norm", () => {
    expect(new Vector2(3, 4).length()).toBe(5);
    expect(new Vector2().length()).toBe(0);
  });

  test("normalize returns a unit vector", () => {
    const unit = new Vector2(10, 0).normalize();
    expect(unit.x).toBeCloseTo(1);
    expect(unit.y).toBeCloseTo(0);
    expect(new Vector2(-7, 24).normalize().length()).toBeCloseTo(1, 12);
  });

  test("normalize of the zero vector is the zero vector (no NaN)", () => {
    expect(new Vector2(0, 0).normalize()).toEqual(new Vector2(0, 0));
  });

  test("fromAngle points in the requested direction", () => {
    const up = Vector2.fromAngle(Math.PI / 2, 2);
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(2);
    expect(Vector2.fromAngle(0).x).toBe(1);
  });
});

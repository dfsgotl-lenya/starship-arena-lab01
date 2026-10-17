import { describe, expect, test } from "vitest";
import { mulberry32, seedFromString } from "../sim/prng.ts";
import { brandNumber, entityId, sequenceNumber, tickNumber } from "../types.ts";

describe("prng and branded numbers", () => {
  test("mulberry32 repeats the same sequence for the same seed", () => {
    const a = mulberry32(99);
    const b = mulberry32(99);
    const seqA = Array.from({ length: 20 }, a);
    expect(Array.from({ length: 20 }, b)).toEqual(seqA);
    expect(new Set(seqA).size).toBe(20);
  });

  test("mulberry32 values are in [0, 1)", () => {
    const random = mulberry32(1);
    for (let i = 0; i < 1000; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  test("seedFromString is a stable 32-bit FNV hash", () => {
    expect(seedFromString("alpha")).toBe(seedFromString("alpha"));
    expect(seedFromString("")).toBe(2166136261);
    expect(seedFromString("alpha")).toBeLessThanOrEqual(0xffffffff);
  });

  test("branded constructors reject out-of-range values", () => {
    expect(() => entityId(70_000)).toThrow(RangeError);
    expect(() => tickNumber(-1)).toThrow(RangeError);
    expect(() => sequenceNumber(1.5)).toThrow(RangeError);
    expect(() => brandNumber(Number.NaN, "x")).toThrow(/x must be/);
    expect(Number(entityId(65_535))).toBe(65_535);
  });
});

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { TokenBucket } from "../src/rate-limit.ts";

describe("TokenBucket (fake clock)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  test("limits bursts to the capacity", () => {
    const bucket = new TokenBucket(2, 2);
    expect(bucket.consume()).toBe(true);
    expect(bucket.consume()).toBe(true);
    expect(bucket.consume()).toBe(false);
  });

  test("refills at the configured rate", () => {
    const bucket = new TokenBucket(10, 10);
    for (let i = 0; i < 10; i += 1) bucket.consume();
    expect(bucket.consume()).toBe(false);
    vi.advanceTimersByTime(100); // 10/s → 1 token
    expect(bucket.consume()).toBe(true);
    expect(bucket.consume()).toBe(false);
  });

  test("never refills above capacity", () => {
    const bucket = new TokenBucket(5, 3);
    vi.advanceTimersByTime(60_000);
    expect([1, 2, 3, 4].map(() => bucket.consume())).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  test("30 inputs/s from a human fit under a 60 msg/s limit for a whole minute", () => {
    const bucket = new TokenBucket(60);
    let rejected = 0;
    for (let i = 0; i < 30 * 60; i += 1) {
      vi.advanceTimersByTime(1000 / 30);
      if (!bucket.consume()) rejected += 1;
    }
    expect(rejected).toBe(0);
  });
});

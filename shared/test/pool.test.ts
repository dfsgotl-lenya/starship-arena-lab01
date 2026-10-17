import { describe, expect, test } from "vitest";
import { Pool } from "../sim/pool.ts";

describe("Pool", () => {
  test("acquire creates objects when the free list is empty", () => {
    const pool = new Pool(() => ({ value: 0 }));
    const a = pool.acquire();
    const b = pool.acquire();
    expect(a).not.toBe(b);
    expect(pool.created).toBe(2);
  });

  test("released objects are reused instead of allocated", () => {
    const pool = new Pool(() => ({ value: 0 }));
    const a = pool.acquire();
    pool.release(a);
    expect(pool.acquire()).toBe(a);
    expect(pool.reused).toBe(1);
    expect(pool.created).toBe(1);
  });

  test("reset runs on release and prefill creates objects up front", () => {
    const pool = new Pool(() => ({ value: 0 }), {
      prefill: 3,
      reset: (item) => (item.value = 0),
    });
    expect(pool.available).toBe(3);
    const item = pool.acquire();
    item.value = 42;
    pool.release(item);
    expect(item.value).toBe(0);
  });

  test("max bounds the free list", () => {
    const pool = new Pool(() => ({}), { max: 1 });
    pool.release(pool.acquire());
    pool.release({});
    expect(pool.available).toBe(1);
  });
});

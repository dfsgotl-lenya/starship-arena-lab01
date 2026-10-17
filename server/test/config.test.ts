import { describe, expect, test } from "vitest";
import { loadConfig } from "../src/config.ts";

describe("loadConfig", () => {
  test("defaults are sane and frozen", () => {
    const config = loadConfig({});
    expect(config.port).toBe(3001);
    expect(config.tickRate).toBe(30);
    expect(config.bots).toBe(0);
    expect(config.broadphase).toBe("hash");
    expect(Object.isFrozen(config)).toBe(true);
  });

  test("coerces env strings and rejects invalid values", () => {
    expect(
      loadConfig({ PORT: "4000", BOTS: "8", BROADPHASE: "naive" }),
    ).toMatchObject({ port: 4000, bots: 8, broadphase: "naive" });
    expect(() => loadConfig({ TICK_RATE: "5" })).toThrow();
    expect(() => loadConfig({ BROADPHASE: "octree" })).toThrow();
  });
});

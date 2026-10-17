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

  test("Lab 8 production keys: origins, per-IP cap, room/player caps, build stamp", () => {
    const config = loadConfig({
      ALLOWED_ORIGINS: "https://starship.onrender.com/, https://friend.example",
      MAX_CONNECTIONS_PER_IP: "4",
      MAX_ROOMS: "20",
      MAX_PLAYERS_PER_ROOM: "16",
      TRUST_PROXY: "true",
      GIT_SHA: "abc1234",
      APP_VERSION: "1.0.0",
    });
    expect(config.allowedOrigins).toEqual([
      "https://starship.onrender.com",
      "https://friend.example",
    ]);
    expect(config).toMatchObject({
      maxConnectionsPerIp: 4,
      maxRooms: 20,
      roomCapacity: 16,
      trustProxy: true,
      gitSha: "abc1234",
      version: "1.0.0",
    });
    expect(() => loadConfig({ ALLOWED_ORIGINS: "not a url" })).toThrow();
    expect(() => loadConfig({ LOG_LEVEL: "loud" })).toThrow();
  });

  test("coerces env strings and rejects invalid values", () => {
    expect(
      loadConfig({ PORT: "4000", BOTS: "8", BROADPHASE: "naive" }),
    ).toMatchObject({ port: 4000, bots: 8, broadphase: "naive" });
    expect(() => loadConfig({ TICK_RATE: "5" })).toThrow();
    expect(() => loadConfig({ BROADPHASE: "octree" })).toThrow();
  });
});

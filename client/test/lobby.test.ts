import { afterEach, describe, expect, test, vi } from "vitest";
import { Lobby } from "../src/lobby/lobby.ts";

const rooms = {
  rooms: [{ id: "alpha", name: "Alpha", players: 0, capacity: 8, arena: {} }],
};

describe("Lobby polling (Lab 8: server restarts)", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("backs off exponentially while the server is down, then recovers", async () => {
    let up = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (!up) throw new TypeError("fetch failed");
        return new Response(JSON.stringify(rooms), {
          headers: { "content-type": "application/json" },
        });
      }),
    );
    vi.useFakeTimers();
    const lobby = new Lobby({ intervalMs: 4000, timeoutMs: 1000 });
    const errors: unknown[] = [];
    lobby.addEventListener("error", (e) => errors.push(e));
    void lobby.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(lobby.nextDelayMs()).toBe(500);
    await vi.advanceTimersByTimeAsync(500);
    expect(lobby.nextDelayMs()).toBe(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(lobby.nextDelayMs()).toBe(2000);
    up = true;
    await vi.advanceTimersByTimeAsync(2000);
    expect(lobby.nextDelayMs()).toBe(4000);
    expect(lobby.rooms).toHaveLength(1);
    expect(errors.length).toBeGreaterThanOrEqual(3);
    lobby.leave();
    vi.useRealTimers();
  });

  test("the backoff is capped at 8 s", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("down"))),
    );
    vi.useFakeTimers();
    const lobby = new Lobby({ intervalMs: 4000, timeoutMs: 1000 });
    void lobby.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(lobby.nextDelayMs()).toBe(8000);
    lobby.leave();
    vi.useRealTimers();
  });
});

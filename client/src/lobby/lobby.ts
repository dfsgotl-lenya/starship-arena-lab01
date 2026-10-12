import { z } from "zod";
import { fetchJson, sleep } from "../assets/loader.ts";
import type { LobbyRoom } from "../types.ts";

export const RoomListSchema = z.object({
  rooms: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      players: z.number().int().nonnegative(),
      capacity: z.number().int().positive(),
      arena: z.object({ asteroidCount: z.number().int().optional() }),
    }),
  ),
});
export type LobbyErrorDetails = {
  readonly phase: "refresh" | "poll";
  readonly error: unknown;
};

async function* intervalTicks(
  signal: AbortSignal,
  intervalMs: number,
): AsyncGenerator<number, void, void> {
  while (!signal.aborted) {
    yield Date.now();
    await sleep(intervalMs, signal);
  }
}

function combinedSignal(
  controllerSignal: AbortSignal,
  timeoutMs: number,
): AbortSignal {
  return AbortSignal.any([controllerSignal, AbortSignal.timeout(timeoutMs)]);
}

export class Lobby extends EventTarget {
  readonly #endpoint: string;
  readonly #intervalMs: number;
  readonly #timeoutMs: number;
  #controller: AbortController | null = null;
  #running = false;
  #rooms: LobbyRoom[] = [];

  constructor({
    endpoint = "/api/rooms",
    intervalMs = 4000,
    timeoutMs = 2500,
  }: {
    readonly endpoint?: string;
    readonly intervalMs?: number;
    readonly timeoutMs?: number;
  } = {}) {
    super();
    this.#endpoint = endpoint;
    this.#intervalMs = intervalMs;
    this.#timeoutMs = timeoutMs;
  }

  get rooms(): readonly LobbyRoom[] {
    return [...this.#rooms];
  }

  async refresh(): Promise<readonly LobbyRoom[] | null> {
    const controller = this.#controller;
    if (!controller) return null;
    const signal = combinedSignal(controller.signal, this.#timeoutMs);
    try {
      const data = await fetchJson(this.#endpoint, { signal });
      const result = RoomListSchema.safeParse(data);
      if (!result.success)
        throw new Error(
          `Invalid room list: ${result.error.issues.map((issue) => issue.message).join("; ")}`,
        );
      this.#rooms = result.data.rooms;
      this.dispatchEvent(
        new CustomEvent("roomsChanged", { detail: this.rooms }),
      );
      return this.rooms;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.name === "AbortError" &&
        controller.signal.aborted
      )
        return null;
      this.dispatchEvent(
        new CustomEvent<LobbyErrorDetails>("error", {
          detail: { phase: "refresh", error },
        }),
      );
      return null;
    }
  }

  async start(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    this.#controller = new AbortController();
    await this.refresh();
    const controller = this.#controller;
    if (!controller) return;
    try {
      for await (const _tick of intervalTicks(
        controller.signal,
        this.#intervalMs,
      )) {
        if (!this.#running) break;
        await this.refresh();
      }
    } catch (error: unknown) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        this.dispatchEvent(
          new CustomEvent<LobbyErrorDetails>("error", {
            detail: { phase: "poll", error },
          }),
        );
      }
    }
  }

  leave(): void {
    this.#running = false;
    this.#controller?.abort();
    this.#controller = null;
  }

  join(roomId: string | null, playerName: string): void {
    const room = this.#rooms.find((item) => item.id === roomId);
    if (!room) throw new Error("Room is no longer available");
    this.leave();
    this.dispatchEvent(
      new CustomEvent("joined", { detail: { room, playerName } }),
    );
  }
}

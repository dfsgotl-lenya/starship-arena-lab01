import { fetchJson, sleep } from "../assets/loader.js";

async function* intervalTicks(signal, intervalMs) {
  while (!signal.aborted) {
    yield Date.now();
    await sleep(intervalMs, signal);
  }
}

function combinedSignal(controllerSignal, timeoutMs) {
  const timeoutSignal = window.AbortSignal.timeout(timeoutMs);
  return window.AbortSignal.any([controllerSignal, timeoutSignal]);
}

export class Lobby extends window.EventTarget {
  #endpoint;
  #intervalMs;
  #timeoutMs;
  #controller = null;
  #running = false;
  #rooms = [];

  constructor({ endpoint = "/api/rooms", intervalMs = 4000, timeoutMs = 2500 } = {}) {
    super();
    this.#endpoint = endpoint;
    this.#intervalMs = intervalMs;
    this.#timeoutMs = timeoutMs;
  }

  get rooms() { return [...this.#rooms]; }

  async refresh() {
    if (!this.#controller) return;
    const signal = combinedSignal(this.#controller.signal, this.#timeoutMs);
    try {
      const data = await fetchJson(this.#endpoint, { signal });
      this.#rooms = Array.isArray(data.rooms) ? data.rooms : [];
      this.dispatchEvent(new window.CustomEvent("roomsChanged", { detail: this.rooms }));
      return this.rooms;
    } catch (error) {
      if (error?.name === "AbortError" && this.#controller.signal.aborted) return null;
      this.dispatchEvent(new window.CustomEvent("error", { detail: { phase: "refresh", error } }));
      return null;
    }
  }

  async start() {
    if (this.#running) return;
    this.#running = true;
    this.#controller = new window.AbortController();
    await this.refresh();
    try {
      for await (const tick of intervalTicks(this.#controller.signal, this.#intervalMs)) {
        void tick;
        if (!this.#running) break;
        await this.refresh();
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        this.dispatchEvent(new window.CustomEvent("error", { detail: { phase: "poll", error } }));
      }
    }
  }

  leave() {
    this.#running = false;
    this.#controller?.abort();
    this.#controller = null;
  }

  join(roomId, playerName) {
    const room = this.#rooms.find((item) => item.id === roomId);
    if (!room) throw new Error("Room is no longer available");
    this.leave();
    this.dispatchEvent(new window.CustomEvent("joined", { detail: { room, playerName } }));
  }
}

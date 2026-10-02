import { performance } from "node:perf_hooks";
import { World, deterministicSeed } from "@starship-arena/shared/sim/world.js";
import { validateInput } from "@starship-arena/shared/protocol/index.js";

export class Match {
  #config;
  #world;
  #players = new Map();
  #timer = null;
  #running = false;
  #nextTarget = 0;
  #tickMs;
  #lastTickDuration = 0;
  #jitterMs = 0;
  #previousTickAt = 0;
  #tickCount = 0;

  constructor(room, config) {
    this.#config = config;
    const tickRate = config.tickRate ?? 30;
    this.#tickMs = 1000 / tickRate;
    const seed = deterministicSeed(room.id, 0x51a7);
    this.#world = new World({
      width: 960,
      height: 600,
      seed,
      arena: room.arena,
    });
    this.#world.seedArena(room.arena);
    this.seed = seed;
  }

  get stats() {
    return {
      tickRate: this.#config.tickRate ?? 30,
      tickCount: this.#tickCount,
      tickDurationMs: this.#lastTickDuration,
      tickJitterMs: this.#jitterMs,
      players: this.#players.size,
      seed: this.seed,
    };
  }

  addPlayer(player) {
    const spawnX =
      this.#players.size === 0
        ? this.#world.width * 0.25
        : this.#world.width * 0.75;
    const spawn = this.#world.addShip(
      this.#world.nextId++,
      spawnX,
      this.#world.height / 2,
    );
    player.shipId = spawn.id;
    player.net = player.net ?? {};
    this.#players.set(player.id, {
      player,
      shipId: spawn.id,
      input: { seq: 0, tick: 0, thrust: false, turn: 0, fire: false },
      pending: [],
      lastProcessedSeq: 0,
    });
    if (!this.#running) this.start();
    return spawn;
  }

  removePlayer(playerId) {
    const state = this.#players.get(playerId);
    if (!state) return;
    this.#world.remove(state.shipId);
    this.#players.delete(playerId);
    if (this.#players.size === 0) this.stop();
  }

  handleInput(playerId, input) {
    const state = this.#players.get(playerId);
    if (!state) return;
    validateInput(input);
    if (
      input.seq <= state.lastProcessedSeq ||
      input.seq > state.lastProcessedSeq + 300
    )
      return;
    state.pending.push(input);
    if (state.pending.length > 8)
      state.pending.splice(0, state.pending.length - 8);
  }

  start() {
    if (this.#running) return;
    this.#running = true;
    this.#nextTarget = performance.now() + this.#tickMs;
    this.#schedule();
  }

  stop() {
    this.#running = false;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #schedule() {
    if (!this.#running) return;
    const delay = Math.max(0, this.#nextTarget - performance.now());
    this.#timer = setTimeout(() => this.#tick(), delay);
  }

  #tick() {
    if (!this.#running) return;
    const start = performance.now();
    const now = performance.now();
    if (this.#previousTickAt) {
      const actualInterval = now - this.#previousTickAt;
      const sample = actualInterval - this.#tickMs;
      this.#jitterMs = this.#jitterMs * 0.9 + Math.abs(sample) * 0.1;
    }
    this.#previousTickAt = now;
    const inputs = new Map();
    for (const state of this.#players.values()) {
      while (
        state.pending.length &&
        state.pending[0].seq <= state.lastProcessedSeq
      )
        state.pending.shift();
      const next = state.pending.shift();
      if (next) {
        state.input = next;
        state.lastProcessedSeq = next.seq;
      }
      inputs.set(state.shipId, state.input);
    }
    const tickRate = this.#config.tickRate ?? 30;
    this.#world.step(1 / tickRate, inputs);
    this.#tickCount += 1;
    this.#lastTickDuration = performance.now() - start;
    const snapshot = this.#world.snapshot();
    for (const state of this.#players.values()) {
      const payload = {
        ...snapshot,
        lastProcessedSeq: state.lastProcessedSeq,
        score: this.#world.scores.get(state.shipId) ?? 0,
        serverTime: Date.now(),
      };
      state.player.net?.sendSnapshot?.(payload, this.#config);
    }
    this.#nextTarget += this.#tickMs;
    if (this.#nextTarget < performance.now() - this.#tickMs * 4)
      this.#nextTarget = performance.now() + this.#tickMs;
    this.#schedule();
  }
}

import { performance } from "node:perf_hooks";
import { World, deterministicSeed } from "@starship-arena/shared/sim/world.ts";
import {
  sequenceNumber,
  tickNumber,
} from "@starship-arena/shared/types.ts";
import type { EntityId, InputPacket } from "@starship-arena/shared/types.ts";
import type { ServerConfig } from "./config.ts";
import type { Room } from "./rooms.ts";
import type { RoomPlayer, SnapshotPayload } from "./types.ts";

interface PlayerMatchState {
  readonly player: RoomPlayer;
  readonly shipId: EntityId;
  input: InputPacket;
  readonly pending: InputPacket[];
  lastProcessedSeq: InputPacket["seq"];
}

export class Match {
  readonly #room: Room;
  readonly #config: ServerConfig;
  readonly #world: World;
  readonly #players = new Map<string, PlayerMatchState>();
  #timer: NodeJS.Timeout | null = null;
  #running = false;
  #nextTarget = 0;
  readonly #tickMs: number;
  #lastTickDuration = 0;
  #jitterMs = 0;
  #previousTickAt = 0;
  #tickCount = 0;
  #spawnCounter = 0;
  #lastStepDuration = 0;
  readonly #tickSamples = new Float64Array(300);
  #tickSampleIndex = 0;
  #tickSampleCount = 0;
  readonly seed: number;

  constructor(room: Room, config: ServerConfig) {
    this.#room = room;
    this.#config = config;
    this.#tickMs = 1000 / config.tickRate;
    this.seed = deterministicSeed(room.id, 0x51a7);
    this.#world = new World({
      width: 960,
      height: 600,
      seed: this.seed,
      arena: room.arena,
    });
    this.#world.seedArena(room.arena);
  }

  get stats() {
    return {
      tickRate: this.#config.tickRate,
      tickCount: this.#tickCount,
      tickDurationMs: this.#lastTickDuration,
      stepDurationMs: this.#lastStepDuration,
      ...this.tickPercentiles(),
      tickJitterMs: this.#jitterMs,
      players: this.#players.size,
      seed: this.seed,
    };
  }

  addPlayer(player: RoomPlayer) {
    const spawn = spawnPoint(
      this.#spawnCounter++,
      this.#world.width,
      this.#world.height,
    );
    const ship = this.#world.addShip(
      this.#world.allocateId(),
      spawn.x,
      spawn.y,
    );
    player.shipId = ship.id;
    this.#players.set(player.id, {
      player,
      shipId: ship.id,
      input: {
        seq: sequenceNumber(0),
        tick: tickNumber(0),
        thrust: false,
        turn: 0,
        fire: false,
      },
      pending: [],
      lastProcessedSeq: sequenceNumber(0),
    });
    if (!this.#running) this.start();
    return ship;
  }

  removePlayer(playerId: string): void {
    const state = this.#players.get(playerId);
    if (!state) return;
    this.#world.remove(state.shipId);
    this.#players.delete(playerId);
    if (this.#players.size === 0) this.stop();
  }

  handleInput(playerId: string | undefined, input: InputPacket): void {
    if (!playerId) return;
    const state = this.#players.get(playerId);
    if (!state) return;
    if (
      input.seq <= state.lastProcessedSeq ||
      input.seq > Number(state.lastProcessedSeq) + 300
    )
      return;
    state.pending.push(input);
    if (state.pending.length > 8)
      state.pending.splice(0, state.pending.length - 8);
  }

  /** p50/p95/p99/max of the last 300 full ticks (≈10 s at 30 Hz). */
  tickPercentiles(): {
    tickP50Ms: number;
    tickP95Ms: number;
    tickP99Ms: number;
    tickMaxMs: number;
  } {
    const count = this.#tickSampleCount;
    if (count === 0)
      return { tickP50Ms: 0, tickP95Ms: 0, tickP99Ms: 0, tickMaxMs: 0 };
    const sorted = this.#tickSamples.slice(0, count).sort();
    const at = (q: number) =>
      sorted[Math.min(count - 1, Math.floor(q * (count - 1)))] ?? 0;
    return {
      tickP50Ms: at(0.5),
      tickP95Ms: at(0.95),
      tickP99Ms: at(0.99),
      tickMaxMs: sorted[count - 1] ?? 0,
    };
  }

  #recordTick(ms: number): void {
    this.#tickSamples[this.#tickSampleIndex] = ms;
    this.#tickSampleIndex = (this.#tickSampleIndex + 1) % this.#tickSamples.length;
    if (this.#tickSampleCount < this.#tickSamples.length) this.#tickSampleCount += 1;
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#nextTarget = performance.now() + this.#tickMs;
    this.#schedule();
  }

  stop(): void {
    this.#running = false;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #schedule(): void {
    if (!this.#running) return;
    const delay = Math.max(0, this.#nextTarget - performance.now());
    this.#timer = setTimeout(() => this.#tick(), delay);
  }

  #tick(): void {
    if (!this.#running) return;
    const start = performance.now();
    const now = performance.now();
    if (this.#previousTickAt) {
      const actualInterval = now - this.#previousTickAt;
      const sample = actualInterval - this.#tickMs;
      this.#jitterMs = this.#jitterMs * 0.9 + Math.abs(sample) * 0.1;
    }
    this.#previousTickAt = now;
    const inputs = new Map<EntityId, InputPacket>();
    for (const state of this.#players.values()) {
      while (
        state.pending.length &&
        state.pending[0]!.seq <= state.lastProcessedSeq
      )
        state.pending.shift();
      const next = state.pending.shift();
      if (next) {
        state.input = next;
        state.lastProcessedSeq = next.seq;
      }
      inputs.set(state.shipId, state.input);
    }
    this.#world.step(1 / this.#config.tickRate, inputs);
    this.#tickCount += 1;
    this.#lastStepDuration = performance.now() - start;
    const snapshot = this.#world.snapshot();
    for (const state of this.#players.values()) {
      const payload: SnapshotPayload = {
        ...snapshot,
        lastProcessedSeq: state.lastProcessedSeq,
        score: this.#world.scores.get(state.shipId) ?? 0,
        serverTime: Date.now(),
      };
      state.player.net.sendSnapshot?.(payload, this.#config);
    }
    // Tick duration = simulation step + snapshot fan-out (what a load test cares about).
    this.#lastTickDuration = performance.now() - start;
    this.#recordTick(this.#lastTickDuration);
    this.#nextTarget += this.#tickMs;
    if (this.#nextTarget < performance.now() - this.#tickMs * 4)
      this.#nextTarget = performance.now() + this.#tickMs;
    this.#schedule();
  }
}

/** Deterministic spawn points: the first two match Lab 5, the rest spiral around the centre. */
export function spawnPoint(
  index: number,
  width: number,
  height: number,
): { x: number; y: number } {
  if (index === 0) return { x: width * 0.25, y: height / 2 };
  if (index === 1) return { x: width * 0.75, y: height / 2 };
  const angle = index * 2.399963229728653;
  const radius = Math.min(width, height) * 0.38;
  return {
    x: width / 2 + Math.cos(angle) * radius,
    y: height / 2 + Math.sin(angle) * radius,
  };
}

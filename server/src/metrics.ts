import { performance } from "node:perf_hooks";
import client from "prom-client";
import type { RoomManager } from "./rooms.ts";

export type RejectionReason =
  | "origin"
  | "ip_limit"
  | "shutting_down"
  | "rate_limit"
  | "bad_binary"
  | "bad_message"
  | "too_large"
  | "join_timeout"
  | "slow_client"
  | "heartbeat";

/**
 * Prometheus metrics on `/metrics` plus per-second rates for the JSON
 * `/api/stats` page. Gauges that describe rooms are computed on scrape
 * (collect callbacks), so the game loop never pays for metrics.
 */
export class Metrics {
  readonly registry = new client.Registry();
  readonly messages: client.Counter<"direction">;
  readonly bytes: client.Counter<"direction">;
  readonly rejections: client.Counter<"reason">;
  readonly connections: client.Gauge;
  readonly #elu: client.Gauge;
  #lastElu = performance.eventLoopUtilization();
  #eluValue = 0;
  readonly #eluTimer: NodeJS.Timeout;
  // Plain counters for the JSON rates (prom-client values are async to read).
  #in = { messages: 0, bytes: 0 };
  #out = { messages: 0, bytes: 0 };
  #rate = { messagesIn: 0, messagesOut: 0, bytesIn: 0, bytesOut: 0 };
  #rateAt = performance.now();

  constructor(
    rooms: () => RoomManager | null,
    version: { version: string; gitSha: string },
  ) {
    const registry = this.registry;
    client.collectDefaultMetrics({ register: registry, prefix: "starship_" });
    new client.Gauge({
      name: "starship_build_info",
      help: "Build version and git SHA",
      labelNames: ["version", "git_sha"],
      registers: [registry],
    }).set({ version: version.version, git_sha: version.gitSha }, 1);
    this.messages = new client.Counter({
      name: "starship_ws_messages_total",
      help: "WebSocket messages",
      labelNames: ["direction"],
      registers: [registry],
    });
    this.bytes = new client.Counter({
      name: "starship_ws_bytes_total",
      help: "WebSocket payload bytes",
      labelNames: ["direction"],
      registers: [registry],
    });
    this.rejections = new client.Counter({
      name: "starship_ws_rejections_total",
      help: "Rejected or force-closed WebSocket connections by reason",
      labelNames: ["reason"],
      registers: [registry],
    });
    this.connections = new client.Gauge({
      name: "starship_ws_connections",
      help: "Open WebSocket connections",
      registers: [registry],
    });
    new client.Gauge({
      name: "starship_players",
      help: "Human players in rooms",
      registers: [registry],
      collect() {
        this.set(
          rooms()
            ?.list()
            .reduce((t, r) => t + r.players, 0) ?? 0,
        );
      },
    });
    new client.Gauge({
      name: "starship_bots",
      help: "Server bots in rooms",
      registers: [registry],
      collect() {
        this.set(
          rooms()
            ?.list()
            .reduce((t, r) => t + r.bots, 0) ?? 0,
        );
      },
    });
    new client.Gauge({
      name: "starship_rooms",
      help: "Open rooms",
      registers: [registry],
      collect() {
        this.set(rooms()?.list().length ?? 0);
      },
    });
    new client.Gauge({
      name: "starship_tick_p99_ms",
      help: "p99 of the last 300 ticks (step + snapshot fan-out) per room",
      labelNames: ["room"],
      registers: [registry],
      collect() {
        this.reset();
        for (const stats of rooms()?.stats() ?? [])
          if (stats.players > 0)
            this.set({ room: stats.room }, stats.tickP99Ms);
      },
    });
    new client.Gauge({
      name: "starship_tick_step_ms",
      help: "Last simulation step duration per room",
      labelNames: ["room"],
      registers: [registry],
      collect() {
        this.reset();
        for (const stats of rooms()?.stats() ?? [])
          if (stats.players > 0)
            this.set({ room: stats.room }, stats.stepDurationMs);
      },
    });
    this.#elu = new client.Gauge({
      name: "starship_event_loop_utilization",
      help: "Share of the last second the event loop was busy (0..1)",
      registers: [registry],
    });
    this.#eluTimer = setInterval(() => this.#sample(), 1000);
    this.#eluTimer.unref();
  }

  messageIn(bytes: number): void {
    this.messages.inc({ direction: "in" });
    this.bytes.inc({ direction: "in" }, bytes);
    this.#in.messages += 1;
    this.#in.bytes += bytes;
  }

  messageOut(bytes: number): void {
    this.messages.inc({ direction: "out" });
    this.bytes.inc({ direction: "out" }, bytes);
    this.#out.messages += 1;
    this.#out.bytes += bytes;
  }

  reject(reason: RejectionReason): void {
    this.rejections.inc({ reason });
  }

  /** Last-second rates + event-loop utilization, for the JSON stats page. */
  rates() {
    return { ...this.#rate, eventLoopUtilization: this.#eluValue };
  }

  stop(): void {
    clearInterval(this.#eluTimer);
  }

  #sample(): void {
    const now = performance.now();
    const seconds = Math.max(0.001, (now - this.#rateAt) / 1000);
    this.#rate = {
      messagesIn: this.#in.messages / seconds,
      messagesOut: this.#out.messages / seconds,
      bytesIn: this.#in.bytes / seconds,
      bytesOut: this.#out.bytes / seconds,
    };
    this.#in = { messages: 0, bytes: 0 };
    this.#out = { messages: 0, bytes: 0 };
    this.#rateAt = now;
    const elu = performance.eventLoopUtilization(this.#lastElu);
    this.#lastElu = performance.eventLoopUtilization();
    this.#eluValue = elu.utilization;
    this.#elu.set(elu.utilization);
  }
}

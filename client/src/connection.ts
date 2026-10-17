import {
  blankNetEntity,
  decodeSnapshotInto,
  encodeInput,
} from "@starship-arena/shared/codec/binary.ts";
import type { PooledSnapshot } from "@starship-arena/shared/codec/binary.ts";
import { entityId } from "@starship-arena/shared/types.ts";
import { unpackSnapshot } from "./netcode/snapshot-pack.ts";
import { decodeJson } from "@starship-arena/shared/codec/json.ts";
import { ServerMessageSchema } from "@starship-arena/shared/protocol/index.ts";
import type {
  ClientMessage,
  ServerMessage,
} from "@starship-arena/shared/protocol/index.ts";
import type { InputPacket } from "@starship-arena/shared/types.ts";

/**
 * Receives snapshots without events or intermediate objects: the connection
 * decodes straight into a pooled slot handed out by the game.
 */
export interface SnapshotSink {
  slot(): PooledSnapshot;
  commit(snapshot: PooledSnapshot): void;
}

/** Messages that already passed ServerMessageSchema once, in the connection. */
const validated = new WeakSet<object>();
export function messageOf(event: Event): ServerMessage | null {
  if (!(event instanceof CustomEvent)) return null;
  const detail: unknown = event.detail;
  return isValidated(detail) ? detail : null;
}
function isValidated(value: unknown): value is ServerMessage {
  return typeof value === "object" && value !== null && validated.has(value);
}

export class GameConnection extends EventTarget {
  snapshotSink: SnapshotSink | null = null;
  /** Main-thread time spent handling snapshots (ms), for the worker experiment. */
  snapshotMainThreadMs = 0;
  snapshotsHandled = 0;
  #worker: Worker | null = null;
  readonly #url: string;
  readonly #protocol: "json" | "binary";
  #socket: WebSocket | null = null;
  readonly #queue: Array<string | ArrayBuffer> = [];
  #backoffMs = 300;
  readonly #maxBackoffMs = 5000;
  #reconnectTimer: number | null = null;
  #manualClose = false;
  #connecting = false;
  #bytesIn = 0;
  #bytesOut = 0;
  #meterAt = performance.now();
  #lastBytes = { in: 0, out: 0 };

  constructor(url = GameConnection.defaultUrl()) {
    super();
    this.#url = url;
    this.#protocol =
      new URL(url).searchParams.get("protocol") === "json" ? "json" : "binary";
  }

  static defaultUrl(): string {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const params = new URLSearchParams();
    const page = new URL(window.location.href);
    for (const key of ["protocol", "latency", "jitter", "drop"]) {
      const value = page.searchParams.get(key);
      if (value !== null) params.set(key, value);
    }
    const suffix = params.toString() ? `?${params}` : "";
    return `${protocol}//${window.location.host}/ws${suffix}`;
  }

  get protocol(): "json" | "binary" {
    return this.#protocol;
  }
  get readyState(): number {
    return this.#socket?.readyState ?? WebSocket.CLOSED;
  }

  getBytesPerSecond(): { in: number; out: number } {
    const now = performance.now();
    const elapsed = Math.max(1, now - this.#meterAt);
    if (elapsed >= 1000) {
      this.#lastBytes = {
        in: (this.#bytesIn * 1000) / elapsed,
        out: (this.#bytesOut * 1000) / elapsed,
      };
      this.#bytesIn = 0;
      this.#bytesOut = 0;
      this.#meterAt = now;
    }
    return { ...this.#lastBytes };
  }

  connect(): void {
    if (this.#manualClose) this.#manualClose = false;
    if (
      this.#connecting ||
      this.readyState === WebSocket.OPEN ||
      this.readyState === WebSocket.CONNECTING
    )
      return;
    this.#connecting = true;
    const socket = new WebSocket(this.#url);
    if (this.#protocol === "binary") socket.binaryType = "arraybuffer";
    this.#socket = socket;
    socket.addEventListener("open", () => {
      this.#connecting = false;
      this.#backoffMs = 300;
      this.#flushQueue();
      this.dispatchEvent(new CustomEvent("open"));
    });
    socket.addEventListener("message", (event: MessageEvent<unknown>) => {
      try {
        if (event.data instanceof ArrayBuffer) {
          this.#bytesIn += event.data.byteLength;
          this.#binarySnapshot(event.data);
          return;
        }
        if (typeof event.data !== "string")
          throw new Error("unsupported WebSocket payload type");
        this.#bytesIn += event.data.length;
        // JSON is untrusted: validate exactly once, here.
        const parsed = ServerMessageSchema.safeParse(decodeJson(event.data));
        if (!parsed.success)
          throw new Error(
            `invalid server message: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
          );
        const message: ServerMessage = parsed.data;
        if (message.type === "snapshot") {
          this.#jsonSnapshot(message);
          return;
        }
        validated.add(message);
        this.dispatchEvent(new CustomEvent(message.type, { detail: message }));
      } catch (error: unknown) {
        this.dispatchEvent(new CustomEvent("protocolError", { detail: error }));
      }
    });
    socket.addEventListener("error", (event) =>
      this.dispatchEvent(new CustomEvent("error", { detail: event })),
    );
    socket.addEventListener("close", (event) => {
      this.#connecting = false;
      this.dispatchEvent(new CustomEvent("close", { detail: event }));
      if (!this.#manualClose) this.#scheduleReconnect();
    });
  }

  send(message: ClientMessage): boolean {
    const encoded = JSON.stringify(message);
    const socket = this.#socket;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(encoded);
      this.#bytesOut += new TextEncoder().encode(encoded).byteLength;
      return true;
    }
    this.#queue.push(encoded);
    return false;
  }

  sendInput(input: InputPacket): boolean {
    if (this.#protocol === "json")
      return this.send({ v: 0, type: "input", ...input });
    const buffer = encodeInput(input);
    const socket = this.#socket;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(buffer);
      this.#bytesOut += buffer.byteLength;
      return true;
    }
    this.#queue.push(buffer);
    return false;
  }

  /**
   * Lab 7 experiment: decode snapshots in a Web Worker (`?worker=1`).
   * The received ArrayBuffer is transferred (zero-copy) to the worker, which
   * validates and packs it into a Float64Array transferred back.
   */
  useWorker(worker: Worker): void {
    this.#worker = worker;
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      const start = performance.now();
      const data: unknown = event.data;
      const sink = this.snapshotSink;
      if (sink && data instanceof Float64Array) {
        const slot = sink.slot();
        unpackSnapshot(data, slot);
        sink.commit(slot);
      } else if (typeof data === "string") {
        this.dispatchEvent(new CustomEvent("protocolError", { detail: data }));
      }
      this.snapshotMainThreadMs += performance.now() - start;
    });
  }

  #binarySnapshot(data: ArrayBuffer): void {
    const start = performance.now();
    this.snapshotsHandled += 1;
    if (this.#worker) {
      this.#worker.postMessage(data, [data]);
    } else {
      const sink = this.snapshotSink;
      if (sink) {
        // Binary frames are validated by the decoder itself (version, type,
        // exact length, kinds, flags, finite floats) — no second zod pass.
        const slot = sink.slot();
        decodeSnapshotInto(data, slot);
        sink.commit(slot);
      }
    }
    this.snapshotMainThreadMs += performance.now() - start;
  }

  #jsonSnapshot(message: Extract<ServerMessage, { type: "snapshot" }>): void {
    const sink = this.snapshotSink;
    if (!sink) return;
    const slot = sink.slot();
    slot.tick = message.tick;
    slot.lastProcessedSeq = message.lastProcessedSeq;
    slot.score = message.score;
    slot.count = message.entities.length;
    while (slot.entities.length < slot.count)
      slot.entities.push(blankNetEntity());
    message.entities.forEach((source, index) => {
      const target = slot.entities[index]!;
      target.id = source.id;
      target.kind = source.kind;
      target.x = source.x;
      target.y = source.y;
      target.vx = source.vx;
      target.vy = source.vy;
      target.angle = source.angle;
      target.radius = source.radius;
      target.alive = source.alive;
      target.hp = source.kind === "ship" ? source.hp : 0;
      target.maxHp = source.kind === "ship" ? source.maxHp : 0;
      target.ownerId = source.kind === "bullet" ? source.ownerId : entityId(0);
      target.ttl = source.kind === "bullet" ? source.ttl : 0;
      target.homing =
        source.kind === "bullet" || source.kind === "asteroid"
          ? source.homing
          : false;
      target.variant =
        source.kind === "asteroid" || source.kind === "pickup"
          ? source.variant
          : 0;
    });
    sink.commit(slot);
  }

  close(code = 1000, reason = "client closing"): void {
    this.#manualClose = true;
    if (this.#reconnectTimer !== null)
      window.clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    this.#queue.length = 0;
    this.#socket?.close(code, reason);
  }

  #flushQueue(): void {
    const socket = this.#socket;
    if (socket?.readyState !== WebSocket.OPEN) return;
    while (this.#queue.length > 0) {
      const item = this.#queue.shift();
      if (item === undefined) continue;
      socket.send(item);
      this.#bytesOut +=
        typeof item === "string"
          ? new TextEncoder().encode(item).byteLength
          : item.byteLength;
    }
  }

  #scheduleReconnect(): void {
    if (this.#reconnectTimer !== null || this.#manualClose) return;
    const delay = this.#backoffMs + Math.round(Math.random() * 100);
    this.dispatchEvent(new CustomEvent("reconnecting", { detail: { delay } }));
    this.#reconnectTimer = window.setTimeout(() => {
      this.#reconnectTimer = null;
      this.connect();
    }, delay);
    this.#backoffMs = Math.min(this.#backoffMs * 2, this.#maxBackoffMs);
  }
}

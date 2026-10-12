import {
  decodeSnapshot,
  encodeInput,
} from "@starship-arena/shared/codec/binary.ts";
import { decodeJson } from "@starship-arena/shared/codec/json.ts";
import { ServerMessageSchema } from "@starship-arena/shared/protocol/index.ts";
import type {
  ClientMessage,
  ServerMessage,
} from "@starship-arena/shared/protocol/index.ts";
import type { InputPacket } from "@starship-arena/shared/types.ts";

export class GameConnection extends EventTarget {
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
        let untrusted: unknown;
        if (event.data instanceof ArrayBuffer) {
          untrusted = { v: 0, type: "snapshot", ...decodeSnapshot(event.data) };
          this.#bytesIn += event.data.byteLength;
        } else if (typeof event.data === "string") {
          this.#bytesIn += new TextEncoder().encode(event.data).byteLength;
          untrusted = decodeJson(event.data);
        } else {
          throw new Error("unsupported WebSocket payload type");
        }
        const parsed = ServerMessageSchema.safeParse(untrusted);
        if (!parsed.success)
          throw new Error(
            `invalid server message: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
          );
        const message: ServerMessage = parsed.data;
        this.dispatchEvent(new CustomEvent(message.type, { detail: message }));
        this.dispatchEvent(new CustomEvent("message", { detail: message }));
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

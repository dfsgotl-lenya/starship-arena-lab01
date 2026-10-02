import {
  decodeSnapshot,
  encodeInput,
} from "@starship-arena/shared/codec/binary.js";

export class GameConnection extends window.EventTarget {
  #url;
  #protocol;
  #socket = null;
  #queue = [];
  #backoffMs = 300;
  #maxBackoffMs = 5000;
  #reconnectTimer = null;
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
      new globalThis.URL(url).searchParams.get("protocol") === "json"
        ? "json"
        : "binary";
  }

  static defaultUrl() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const params = new globalThis.URLSearchParams();
    const page = new globalThis.URL(window.location.href);
    for (const key of ["protocol", "latency", "jitter", "drop"])
      if (page.searchParams.has(key))
        params.set(key, page.searchParams.get(key));
    const suffix = params.toString() ? `?${params}` : "";
    return `${protocol}//${window.location.host}/ws${suffix}`;
  }

  get protocol() {
    return this.#protocol;
  }
  get readyState() {
    return this.#socket?.readyState ?? WebSocket.CLOSED;
  }
  getBytesPerSecond() {
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

  connect() {
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
    socket.addEventListener("message", (event) => {
      try {
        this.#bytesIn +=
          typeof event.data === "string"
            ? new TextEncoder().encode(event.data).byteLength
            : event.data.byteLength;
        const message =
          event.data instanceof ArrayBuffer
            ? decodeSnapshot(event.data)
            : JSON.parse(event.data);
        const type =
          event.data instanceof ArrayBuffer ? "snapshot" : message.type;
        this.dispatchEvent(new CustomEvent(type, { detail: message }));
        this.dispatchEvent(new CustomEvent("message", { detail: message }));
      } catch (error) {
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

  send(message) {
    const encoded = JSON.stringify(message);
    if (this.readyState === WebSocket.OPEN) {
      this.#socket.send(encoded);
      this.#bytesOut += new TextEncoder().encode(encoded).byteLength;
      return true;
    }
    this.#queue.push(encoded);
    return false;
  }

  sendInput(input) {
    if (this.#protocol === "json")
      return this.send({ v: 0, type: "input", ...input });
    const buffer = encodeInput(input);
    if (this.readyState === WebSocket.OPEN) {
      this.#socket.send(buffer);
      this.#bytesOut += buffer.byteLength;
      return true;
    }
    this.#queue.push(buffer);
    return false;
  }

  close(code = 1000, reason = "client closing") {
    this.#manualClose = true;
    if (this.#reconnectTimer) window.clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    this.#queue.length = 0;
    this.#socket?.close(code, reason);
  }

  #flushQueue() {
    if (this.readyState !== WebSocket.OPEN) return;
    while (this.#queue.length > 0) {
      const item = this.#queue.shift();
      this.#socket.send(item);
      this.#bytesOut +=
        typeof item === "string"
          ? new TextEncoder().encode(item).byteLength
          : item.byteLength;
    }
  }

  #scheduleReconnect() {
    if (this.#reconnectTimer || this.#manualClose) return;
    const delay = this.#backoffMs + Math.round(Math.random() * 100);
    this.dispatchEvent(new CustomEvent("reconnecting", { detail: { delay } }));
    this.#reconnectTimer = window.setTimeout(() => {
      this.#reconnectTimer = null;
      this.connect();
    }, delay);
    this.#backoffMs = Math.min(this.#backoffMs * 2, this.#maxBackoffMs);
  }
}

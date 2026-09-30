export class GameConnection extends EventTarget {
  #url;
  #socket = null;
  #queue = [];
  #backoffMs = 300;
  #maxBackoffMs = 5000;
  #reconnectTimer = null;
  #manualClose = false;
  #connecting = false;

  constructor(url = GameConnection.defaultUrl()) {
    super();
    this.#url = url;
  }

  static defaultUrl() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws`;
  }

  get readyState() {
    return this.#socket?.readyState ?? WebSocket.CLOSED;
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
    this.#socket = socket;

    socket.addEventListener("open", () => {
      this.#connecting = false;
      this.#backoffMs = 300;
      this.#flushQueue();
      this.dispatchEvent(new CustomEvent("open"));
    });

    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data);
        this.dispatchEvent(new CustomEvent("message", { detail: message }));
        this.dispatchEvent(new CustomEvent(message.type, { detail: message }));
      } catch (error) {
        this.dispatchEvent(new CustomEvent("protocolError", { detail: error }));
      }
    });

    socket.addEventListener("error", (event) => {
      this.dispatchEvent(new CustomEvent("error", { detail: event }));
    });

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
      return true;
    }
    this.#queue.push(encoded);
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
    while (this.#queue.length > 0) this.#socket.send(this.#queue.shift());
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

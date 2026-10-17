import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { RawData } from "ws";
import { TokenBucket } from "./rate-limit.ts";
import { parseClientMessage } from "./protocol.ts";
import {
  decodeInput,
  encodeSnapshot,
  withSnapshotHeader,
} from "@starship-arena/shared/codec/binary.ts";
import type { ClientMessage } from "@starship-arena/shared/protocol/index.ts";
import type { ServerConfig } from "./config.ts";
import type { RoomManager } from "./rooms.ts";
import type {
  NetSettings,
  RoomPlayer,
  SocketAppState,
  SnapshotFrame,
  SnapshotPayload,
} from "./types.ts";
import { errorMessage } from "./types.ts";
import type { Logger } from "./logger.ts";
import { silentLogger } from "./logger.ts";
import type { Metrics, RejectionReason } from "./metrics.ts";

declare module "ws" {
  interface WebSocket {
    appState?: SocketAppState;
  }
}

const DEFAULT_NET: NetSettings = {
  latency: 0,
  jitter: 0,
  drop: 0,
  protocol: "json",
};

export interface WebSocketLayerOptions {
  readonly logger?: Logger;
  readonly metrics?: Metrics;
  /** True once SIGTERM arrived: new handshakes get 503. */
  readonly isShuttingDown?: () => boolean;
}

export interface WebSocketLayer {
  readonly wss: WebSocketServer;
  /** Clients currently connected per IP (for tests and /api/stats). */
  readonly connectionsByIp: ReadonlyMap<string, number>;
  /**
   * Graceful close: every client gets a `shutdown` message and close code
   * 1001 ("going away"); stragglers are terminated after `timeoutMs`.
   */
  shutdown(timeoutMs: number): Promise<void>;
}

function netSettings(url: URL, config: ServerConfig): NetSettings {
  const latency = clamp(
    Number(url.searchParams.get("latency") ?? config.netLatencyMs),
    0,
    5000,
  );
  const jitter = clamp(
    Number(url.searchParams.get("jitter") ?? config.netJitterMs),
    0,
    5000,
  );
  const drop = clamp(
    Number(url.searchParams.get("drop") ?? config.netDropPct),
    0,
    100,
  );
  const protocol =
    url.searchParams.get("protocol") === "json" ? "json" : "binary";
  return { latency, jitter, drop, protocol };
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}
function delayFor(net: NetSettings): number {
  return Math.max(0, net.latency + (Math.random() * 2 - 1) * net.jitter);
}

/** Client IP; behind a trusted proxy the left-most X-Forwarded-For entry. */
export function clientIp(
  request: IncomingMessage,
  trustProxy: boolean,
): string {
  if (trustProxy) {
    const forwarded = request.headers["x-forwarded-for"];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
      ?.split(",")[0]
      ?.trim();
    if (first) return first;
  }
  return request.socket.remoteAddress ?? "unknown";
}

/**
 * CORS does not apply to WebSockets, so any page could open a socket to us
 * with its visitor's cookies/IP. The browser always sends `Origin`; accept
 * our own origin (same host as the request), configured ones, and — if
 * allowed — clients without Origin (bots, load test; they can lie anyway).
 */
export function isOriginAllowed(
  request: IncomingMessage,
  config: Pick<ServerConfig, "allowedOrigins" | "allowMissingOrigin">,
): boolean {
  const origin = request.headers.origin;
  if (!origin) return config.allowMissingOrigin;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch (_error: unknown) {
    return false;
  }
  const normalized = `${parsed.protocol}//${parsed.host}`;
  if (config.allowedOrigins.includes(normalized)) return true;
  const host =
    request.headers["x-forwarded-host"]?.toString().split(",")[0]?.trim() ??
    request.headers.host;
  return host !== undefined && parsed.host === host;
}

function rejectUpgrade(socket: Duplex, status: number, text: string): void {
  socket.write(
    `HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(text)}\r\n\r\n${text}`,
  );
  socket.destroy();
}

export function attachWebSocketServer(
  server: Server,
  roomManager: RoomManager,
  config: ServerConfig,
  {
    logger = silentLogger,
    metrics,
    isShuttingDown = () => false,
  }: WebSocketLayerOptions = {},
): WebSocketLayer {
  const log = logger.child({ component: "ws" });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: config.maxPayload,
  });
  const connectionsByIp = new Map<string, number>();
  const reject = (reason: RejectionReason, fields: Record<string, unknown>) => {
    metrics?.reject(reason);
    log.warn({ event: "ws.rejected", reason, ...fields });
  };

  // The handshake is checked before ws ever sees the socket.
  const onUpgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => {
    const url = new URL(request.url ?? "/", "http://placeholder");
    if (url.pathname !== "/ws") {
      rejectUpgrade(socket, 404, "Not Found");
      return;
    }
    const ip = clientIp(request, config.trustProxy);
    if (isShuttingDown()) {
      reject("shutting_down", { ip });
      rejectUpgrade(socket, 503, "Service Unavailable");
      return;
    }
    if (!isOriginAllowed(request, config)) {
      reject("origin", { ip, origin: request.headers.origin });
      rejectUpgrade(socket, 403, "Forbidden");
      return;
    }
    const open = connectionsByIp.get(ip) ?? 0;
    if (open >= config.maxConnectionsPerIp) {
      reject("ip_limit", { ip, open });
      rejectUpgrade(socket, 429, "Too Many Requests");
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request, ip);
    });
  };
  server.on("upgrade", onUpgrade);

  const heartbeatTimer = setInterval(() => {
    for (const socket of wss.clients) {
      const state = socket.appState;
      if (!state) continue;
      if (!state.isAlive) {
        state.missedPongs += 1;
        if (state.missedPongs >= 2) {
          reject("heartbeat", { connId: state.id });
          socket.terminate();
          continue;
        }
      }
      state.isAlive = false;
      try {
        socket.ping();
      } catch (_error: unknown) {
        socket.terminate();
      }
    }
  }, config.heartbeatMs);
  heartbeatTimer.unref();

  const send: Sender = (socket, payload, critical = false) => {
    if (socket.readyState !== WebSocket.OPEN) return false;
    if (socket.bufferedAmount > config.slowClientBytes) {
      if (critical) {
        reject("slow_client", { connId: socket.appState?.id });
        socket.close(1013, "slow client");
      }
      return false;
    }
    const data =
      typeof payload === "string" || Buffer.isBuffer(payload)
        ? payload
        : JSON.stringify(payload);
    if (data === undefined) return false;
    socket.send(data);
    metrics?.messageOut(
      typeof data === "string" ? Buffer.byteLength(data) : data.byteLength,
    );
    return true;
  };

  wss.on(
    "connection",
    (socket: WebSocket, request: IncomingMessage, ip: string) => {
      connectionsByIp.set(ip, (connectionsByIp.get(ip) ?? 0) + 1);
      metrics?.connections.inc();
      const url = new URL(request.url ?? "/ws", "http://placeholder");
      const net = netSettings(url, config);
      const state: SocketAppState = {
        id: randomUUID(),
        player: null,
        room: null,
        isAlive: true,
        missedPongs: 0,
        joinTimer: setTimeout(() => {
          reject("join_timeout", { connId: state.id, ip });
          socket.close(1008, "join timeout");
        }, config.joinTimeoutMs),
        bucket: new TokenBucket(config.messageRate),
        net,
      };
      socket.appState = state;
      const connLog = log.child({ connId: state.id });
      connLog.debug({ event: "ws.connected", ip, protocol: net.protocol });
      socket.on("error", (error) =>
        connLog.debug({ event: "ws.error", err: error }),
      );
      socket.on("pong", () => {
        state.isAlive = true;
        state.missedPongs = 0;
      });
      socket.on("message", (raw: RawData, isBinary: boolean) => {
        metrics?.messageIn(rawLength(raw));
        // Already being closed (e.g. a flood): count bytes, do no more work.
        if (socket.readyState !== WebSocket.OPEN) return;
        if (!state.bucket.consume()) {
          reject("rate_limit", {
            connId: state.id,
            ip,
            roomId: state.room?.id,
          });
          socket.close(1008, "message rate limit exceeded");
          return;
        }
        if (isBinary === true) {
          try {
            const decoded = decodeInput(raw);
            setTimeout(
              () => state.room?.match.handleInput(state.player?.id, decoded),
              delayFor(net),
            );
          } catch (error: unknown) {
            reject("bad_binary", {
              connId: state.id,
              ip,
              roomId: state.room?.id,
              playerId: state.player?.id,
              detail: errorMessage(error),
            });
            socket.close(1008, "invalid binary frame");
          }
          return;
        }

        const parsed = parseClientMessage(raw, config.maxPayload);
        if (!parsed.success) {
          reject(
            parsed.code === "MESSAGE_TOO_LARGE" ? "too_large" : "bad_message",
            {
              connId: state.id,
              ip,
              code: parsed.code,
            },
          );
          socket.close(
            parsed.code === "MESSAGE_TOO_LARGE" ? 1009 : 1008,
            parsed.error.message.slice(0, 120),
          );
          return;
        }
        try {
          dispatchMessage(
            socket,
            state,
            parsed.data,
            roomManager,
            config,
            send,
            connLog,
          );
        } catch (error: unknown) {
          send(
            socket,
            { v: 0, type: "errorMessage", message: errorMessage(error) },
            true,
          );
        }
      });
      socket.on("close", (code) => {
        clearTimeout(state.joinTimer);
        metrics?.connections.dec();
        const left = (connectionsByIp.get(ip) ?? 1) - 1;
        if (left <= 0) connectionsByIp.delete(ip);
        else connectionsByIp.set(ip, left);
        if (state.room && state.player) {
          const room = state.room;
          connLog.info({
            event: "player.left",
            roomId: room.id,
            playerId: state.player.id,
            code,
          });
          room.leave(state.player.id);
          room.broadcast(
            { v: 0, type: "roster", players: room.roster() },
            (client, payload) => send(client, payload, true),
          );
        }
      });
    },
  );

  return {
    wss,
    connectionsByIp,
    async shutdown(timeoutMs: number): Promise<void> {
      clearInterval(heartbeatTimer);
      server.off("upgrade", onUpgrade);
      const clients = [...wss.clients];
      const closed = Promise.all(
        clients.map(
          (client) =>
            new Promise<void>((resolve) => {
              if (client.readyState === WebSocket.CLOSED) return resolve();
              client.once("close", () => resolve());
            }),
        ),
      );
      for (const client of clients) {
        if (client.readyState !== WebSocket.OPEN) continue;
        // Tell the client why, so it can show a message and go back to the lobby.
        client.send(
          JSON.stringify({
            v: 0,
            type: "shutdown",
            reason: "server restarting",
            reconnectMs: 2000,
          }),
        );
        client.close(1001, "server shutdown");
      }
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        closed,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, timeoutMs);
        }),
      ]);
      clearTimeout(timer);
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      log.info({ event: "ws.closed", clients: clients.length });
    },
  };
}

type Sender = (
  socket: WebSocket,
  payload: unknown,
  critical?: boolean,
) => boolean;

function rawLength(raw: RawData): number {
  if (Array.isArray(raw))
    return raw.reduce((total, part) => total + part.byteLength, 0);
  return raw.byteLength;
}

function dispatchMessage(
  socket: WebSocket,
  state: SocketAppState,
  message: ClientMessage,
  roomManager: RoomManager,
  config: ServerConfig,
  send: Sender,
  log: Logger,
): void {
  switch (message.type) {
    case "join":
      handleJoin(socket, state, message, roomManager, config, send, log);
      return;
    case "chat":
      handleChat(state, message, send);
      return;
    case "leave":
      handleLeave(socket, state, send, log);
      return;
    case "input":
      setTimeout(
        () => state.room?.match.handleInput(state.player?.id, message),
        delayFor(state.net),
      );
      return;
    case "ping":
      send(socket, { v: 0, type: "pong", t: message.t });
      return;
    default:
      return assertNever(message);
  }
}

function handleJoin(
  socket: WebSocket,
  state: SocketAppState,
  message: Extract<ClientMessage, { type: "join" }>,
  roomManager: RoomManager,
  config: ServerConfig,
  send: Sender,
  log: Logger,
): void {
  if (state.player) throw new Error("already joined");
  const room = roomManager.get(message.room);
  if (!room) throw new Error("room not found");
  const player: RoomPlayer = {
    id: state.id,
    name: message.name,
    socket,
    net: { protocol: state.net.protocol },
  };
  player.net.sendSnapshot = (
    snapshot: SnapshotPayload,
    _serverConfig: ServerConfig,
    frame?: SnapshotFrame,
  ) => {
    if (state.net.protocol === "json") {
      const body = frame ? frame.json() : snapshot;
      const text = JSON.stringify({
        v: 0,
        type: "snapshot",
        ...body,
        lastProcessedSeq: snapshot.lastProcessedSeq,
        score: snapshot.score,
        serverTime: snapshot.serverTime,
      });
      delayedSend(socket, text, state.net, send);
    } else {
      const bytes = frame
        ? withSnapshotHeader(
            frame.binary(),
            snapshot.lastProcessedSeq,
            snapshot.score,
          )
        : new Uint8Array(
            encodeSnapshot(snapshot, snapshot.lastProcessedSeq, snapshot.score),
          );
      delayedSend(
        socket,
        Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
        state.net,
        send,
      );
    }
  };
  room.join(player);
  state.player = player;
  state.room = room;
  clearTimeout(state.joinTimer);
  log.info({ event: "player.joined", roomId: room.id, playerId: player.id });
  send(
    socket,
    {
      v: 0,
      type: "joined",
      room: room.id,
      playerId: player.id,
      shipId: player.shipId,
      seed: room.match.seed,
      tickRate: config.tickRate,
      protocol: state.net.protocol,
    },
    true,
  );
  room.broadcast(
    { v: 0, type: "roster", players: room.roster() },
    (client, payload) => send(client, payload, true),
  );
}

function handleChat(
  state: SocketAppState,
  message: Extract<ClientMessage, { type: "chat" }>,
  send: Sender,
): void {
  if (!state.room || !state.player) throw new Error("join a room first");
  state.room.chat(state.player, message.text);
  state.room.broadcast(
    {
      v: 0,
      type: "chat",
      name: state.player.name,
      text: message.text,
      t: Date.now(),
    },
    (client, payload) => send(client, payload),
  );
}

function handleLeave(
  socket: WebSocket,
  state: SocketAppState,
  send: Sender,
  log: Logger,
): void {
  if (!state.room || !state.player) return;
  const room = state.room;
  log.info({
    event: "player.left",
    roomId: room.id,
    playerId: state.player.id,
  });
  room.leave(state.player.id);
  state.room = null;
  state.player = null;
  send(socket, { v: 0, type: "left" }, true);
  room.broadcast(
    { v: 0, type: "roster", players: room.roster() },
    (client, payload) => send(client, payload, true),
  );
}

function delayedSend(
  socket: WebSocket,
  data: string | Buffer,
  net: NetSettings,
  send: Sender,
): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (net.drop > 0 && Math.random() * 100 < net.drop) return;
  if (net.latency === 0 && net.jitter === 0) {
    send(socket, data);
    return;
  }
  setTimeout(() => {
    send(socket, data);
  }, delayFor(net));
}

function assertNever(value: never): never {
  throw new Error(`Unhandled client message: ${JSON.stringify(value)}`);
}

export { DEFAULT_NET };

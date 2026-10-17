import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
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
import { RoomManager } from "./rooms.ts";
import type {
  NetSettings,
  RoomPlayer,
  SocketAppState,
  SnapshotFrame,
  SnapshotPayload,
} from "./types.ts";
import { errorMessage } from "./types.ts";

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

export function attachWebSocketServer(
  wss: WebSocketServer,
  roomManager: RoomManager,
  config: ServerConfig,
): () => void {
  const heartbeatTimer = setInterval(() => {
    for (const socket of wss.clients) {
      const state = socket.appState;
      if (!state) continue;
      if (!state.isAlive) {
        state.missedPongs += 1;
        if (state.missedPongs >= 2) {
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

  wss.on("connection", (socket: WebSocket, request: IncomingMessage) => {
    const url = new URL(
      request.url ?? "/ws",
      `http://${config.host}:${config.port}`,
    );
    const net = netSettings(url, config);
    const state: SocketAppState = {
      id: randomUUID(),
      player: null,
      room: null,
      isAlive: true,
      missedPongs: 0,
      joinTimer: setTimeout(() => socket.close(1008, "join timeout"), 5000),
      bucket: new TokenBucket(config.messageRate),
      net,
    };
    socket.appState = state;
    socket.on("error", () => {});
    socket.on("pong", () => {
      state.isAlive = true;
      state.missedPongs = 0;
    });
    socket.on("message", (raw: RawData, isBinary: boolean) => {
      if (!state.bucket.consume()) {
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
          console.warn("[ws] invalid binary message", errorMessage(error));
          socket.close(1008, errorMessage(error));
        }
        return;
      }

      const parsed = parseClientMessage(raw, config.maxPayload);
      if (!parsed.success) {
        console.warn(
          `[ws] rejected ${parsed.code.toLowerCase()}:`,
          parsed.error.message,
        );
        socket.close(
          parsed.code === "MESSAGE_TOO_LARGE" ? 1009 : 1008,
          parsed.error.message,
        );
        return;
      }
      try {
        dispatchMessage(socket, state, parsed.data, roomManager, config);
      } catch (error: unknown) {
        safeSend(
          socket,
          { v: 0, type: "errorMessage", message: errorMessage(error) },
          config,
          state.net,
          true,
        );
      }
    });
    socket.on("close", () => {
      clearTimeout(state.joinTimer);
      if (state.room && state.player) {
        const room = state.room;
        room.leave(state.player.id);
        room.broadcast(
          { v: 0, type: "roster", players: room.roster() },
          (client, payload) =>
            safeSend(client, payload, config, client.appState?.net, true),
        );
      }
    });
  });
  return () => clearInterval(heartbeatTimer);
}

function dispatchMessage(
  socket: WebSocket,
  state: SocketAppState,
  message: ClientMessage,
  roomManager: RoomManager,
  config: ServerConfig,
): void {
  switch (message.type) {
    case "join":
      handleJoin(socket, state, message, roomManager, config);
      return;
    case "chat":
      handleChat(state, message, config);
      return;
    case "leave":
      handleLeave(socket, state, config);
      return;
    case "input":
      setTimeout(
        () => state.room?.match.handleInput(state.player?.id, message),
        delayFor(state.net),
      );
      return;
    case "ping":
      safeSend(socket, { v: 0, type: "pong", t: message.t }, config, state.net);
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
    serverConfig: ServerConfig,
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
      delayedSend(socket, text, state.net, serverConfig);
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
        serverConfig,
      );
    }
  };
  room.join(player);
  state.player = player;
  state.room = room;
  clearTimeout(state.joinTimer);
  safeSend(
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
    config,
    state.net,
    true,
  );
  room.broadcast(
    { v: 0, type: "roster", players: room.roster() },
    (client, payload) =>
      safeSend(client, payload, config, client.appState?.net, true),
  );
}

function handleChat(
  state: SocketAppState,
  message: Extract<ClientMessage, { type: "chat" }>,
  config: ServerConfig,
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
    (client, payload) =>
      safeSend(client, payload, config, client.appState?.net),
  );
}

function handleLeave(
  socket: WebSocket,
  state: SocketAppState,
  config: ServerConfig,
): void {
  if (!state.room || !state.player) return;
  const room = state.room;
  room.leave(state.player.id);
  state.room = null;
  state.player = null;
  safeSend(socket, { v: 0, type: "left" }, config, state.net, true);
  room.broadcast(
    { v: 0, type: "roster", players: room.roster() },
    (client, payload) =>
      safeSend(client, payload, config, client.appState?.net, true),
  );
}

function safeSend(
  socket: WebSocket,
  payload: unknown,
  config: ServerConfig,
  _net: NetSettings = DEFAULT_NET,
  critical = false,
): boolean {
  if (socket.readyState !== WebSocket.OPEN) return false;
  if (socket.bufferedAmount > config.slowClientBytes) {
    if (critical) socket.close(1013, "slow client");
    return false;
  }
  const data =
    typeof payload === "string" || Buffer.isBuffer(payload)
      ? payload
      : JSON.stringify(payload);
  if (data === undefined) return false;
  socket.send(data);
  return true;
}

function delayedSend(
  socket: WebSocket,
  data: string | Buffer,
  net: NetSettings,
  config: ServerConfig,
): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (Math.random() * 100 < net.drop) return;
  setTimeout(() => {
    safeSend(socket, data, config, net);
  }, delayFor(net));
}

function assertNever(value: never): never {
  throw new Error(`Unhandled client message: ${JSON.stringify(value)}`);
}

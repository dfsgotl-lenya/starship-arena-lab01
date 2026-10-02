import { randomUUID } from "node:crypto";
import { TokenBucket } from "./rate-limit.js";
import { parseMessage } from "./protocol.js";
import { decodeInput } from "@starship-arena/shared/codec/binary.js";
import { encodeSnapshot } from "@starship-arena/shared/codec/binary.js";

function netSettings(url, config) {
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

function clamp(value, min, max) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}
function delayFor(net) {
  return Math.max(0, net.latency + (Math.random() * 2 - 1) * net.jitter);
}

export function attachWebSocketServer(wss, roomManager, config) {
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
      } catch {
        socket.terminate();
      }
    }
  }, config.heartbeatMs);

  wss.on("connection", (socket, request) => {
    const url = new URL(
      request.url ?? "/ws",
      `http://${config.host}:${config.port}`,
    );
    const net = netSettings(url, config);
    const state = {
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
    socket.on("message", (raw, isBinary) => {
      if (!state.bucket.consume()) {
        socket.close(1008, "message rate limit exceeded");
        return;
      }
      if (isBinary || Buffer.isBuffer(raw)) {
        try {
          const decoded = decodeInput(raw);
          setTimeout(
            () => state.room?.match.handleInput(state.player?.id, decoded),
            delayFor(net),
          );
        } catch (error) {
          socket.close(1008, error.message);
        }
        return;
      }
      let message;
      try {
        message = parseMessage(raw, config.maxPayload);
      } catch (error) {
        socket.close(
          error.code === "MESSAGE_TOO_LARGE" ? 1009 : 1008,
          error.message,
        );
        return;
      }
      try {
        if (message.type === "join")
          handleJoin(socket, state, message, roomManager, config);
        else if (message.type === "chat")
          handleChat(socket, state, message, config);
        else if (message.type === "leave") handleLeave(socket, state, config);
        else if (message.type === "input")
          setTimeout(
            () => state.room?.match.handleInput(state.player?.id, message),
            delayFor(net),
          );
        else if (message.type === "ping")
          safeSend(
            socket,
            { v: 0, type: "pong", t: message.t },
            config,
            state.net,
          );
      } catch (error) {
        safeSend(
          socket,
          { v: 0, type: "errorMessage", message: error.message },
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

function handleJoin(socket, state, message, roomManager, config) {
  if (state.player) throw new Error("already joined");
  const room = roomManager.get(message.room);
  if (!room) throw new Error("room not found");
  const player = { id: state.id, name: message.name, socket, net: {} };
  player.net.sendSnapshot = (snapshot) => {
    if (state.net.protocol === "json") {
      const text = JSON.stringify({ v: 0, type: "snapshot", ...snapshot });
      delayedSend(socket, text, state.net, config);
    } else {
      const data = encodeSnapshot(
        snapshot,
        snapshot.lastProcessedSeq,
        snapshot.score,
      );
      delayedSend(socket, Buffer.from(data), state.net, config);
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

function handleChat(socket, state, message, config) {
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

function handleLeave(socket, state, config) {
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
  socket,
  payload,
  config,
  _net = { protocol: "json" },
  critical = false,
) {
  if (socket.readyState !== 1) return false;
  if (socket.bufferedAmount > config.slowClientBytes) {
    if (critical) socket.close(1013, "slow client");
    return false;
  }
  const data =
    typeof payload === "string" || Buffer.isBuffer(payload)
      ? payload
      : JSON.stringify(payload);
  socket.send(data);
  return true;
}

function delayedSend(socket, data, net, config) {
  if (socket.readyState !== 1) return;
  if (Math.random() * 100 < net.drop) return;
  const delay = delayFor(net);
  setTimeout(() => safeSend(socket, data, config, net), delay);
}

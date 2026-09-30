import { randomUUID } from "node:crypto";
import { TokenBucket } from "./rate-limit.js";
import { parseMessage } from "./protocol.js";

function safeSend(socket, payload, config, critical = false) {
  if (socket.readyState !== 1) return false;
  const data = JSON.stringify(payload);
  if (socket.bufferedAmount > config.slowClientBytes) {
    if (!critical) return false;
    socket.close(1013, "slow client");
    return false;
  }
  socket.send(data);
  return true;
}

export function attachWebSocketServer(wss, roomManager, config) {
  const heartbeatTimer = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.appState) continue;
      if (!socket.appState.isAlive) {
        socket.appState.missedPongs += 1;
        if (socket.appState.missedPongs >= 2) {
          socket.terminate();
          continue;
        }
      }
      socket.appState.isAlive = false;
      try {
        socket.ping();
      } catch {
        socket.terminate();
      }
    }
  }, config.heartbeatMs);

  wss.on("connection", (socket) => {
    const state = {
      id: randomUUID(),
      player: null,
      room: null,
      isAlive: true,
      missedPongs: 0,
      joinTimer: setTimeout(() => socket.close(1008, "join timeout"), 5000),
      bucket: new TokenBucket(config.messageRate),
    };
    socket.appState = state;
    socket.on("error", () => {});
    socket.on("pong", () => {
      state.isAlive = true;
      state.missedPongs = 0;
    });

    socket.on("message", (raw) => {
      if (!state.bucket.consume()) {
        socket.close(1008, "message rate limit exceeded");
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
      } catch (error) {
        safeSend(
          socket,
          { v: 0, type: "errorMessage", message: error.message },
          config,
          true,
        );
        socket.close(1008, "policy violation");
      }
    });

    socket.on("close", () => {
      clearTimeout(state.joinTimer);
      if (state.room && state.player) {
        const room = state.room;
        room.leave(state.player.id);
        room.broadcast(
          { v: 0, type: "roster", players: room.roster() },
          (client, payload) => safeSend(client, payload, config, true),
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
  const player = { id: state.id, name: message.name, socket };
  room.join(player);
  state.player = player;
  state.room = room;
  clearTimeout(state.joinTimer);
  safeSend(
    socket,
    { v: 0, type: "joined", room: room.id, playerId: player.id },
    config,
    true,
  );
  room.broadcast(
    { v: 0, type: "roster", players: room.roster() },
    (client, payload) => safeSend(client, payload, config, true),
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
    (client, payload) => safeSend(client, payload, config),
  );
}

function handleLeave(socket, state, config) {
  if (!state.room || !state.player) return;
  const room = state.room;
  room.leave(state.player.id);
  state.room = null;
  state.player = null;
  safeSend(socket, { v: 0, type: "left" }, config, true);
  room.broadcast(
    { v: 0, type: "roster", players: room.roster() },
    (client, payload) => safeSend(client, payload, config, true),
  );
}

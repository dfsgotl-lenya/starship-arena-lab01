import "./style.css";
import { createInput } from "./input.js";
import { createLoop } from "./loop.js";
import { setupCanvas } from "./render/canvas.js";
import { drawArenaFrame, drawBackground, drawWorld } from "./render/draw.js";
import { loadAll, loadJson } from "./assets/loader.js";
import { createAudioEngine } from "./audio.js";
import { Lobby } from "./lobby/lobby.js";
import { mountLobby } from "./lobby/dom.js";
import { mountDiagnostics } from "./diagnostics.js";
import { createHud } from "./hud.js";
import { GameConnection } from "./connection.js";
import { NetworkGame } from "./netcode/game-client.js";

const canvas = document.querySelector("#game");
const canvasApi = setupCanvas(canvas);
const events = new window.EventTarget();
const input = createInput(window);
const audio = createAudioEngine();
const lobby = new Lobby();
const connection = new GameConnection();
const dom = Object.fromEntries(
  [
    "loading",
    "loadingLabel",
    "loadingError",
    "retry",
    "lobby",
    "game",
    "canvasWrap",
    "statusBadge",
    "steps",
    "frames",
    "frameTime",
    "hp",
    "score",
    "entities",
    "activePower",
    "room",
    "diagnostics",
    "chatPanel",
    "roster",
    "rosterCount",
    "chatLog",
    "chatForm",
    "chatInput",
    "leaveRoom",
    "netgraph",
    "protocolLabel",
    "netRtt",
    "netAge",
    "netBytes",
    "netPending",
    "netCorrection",
    "interpDelay",
    "breakDeterminism",
  ].map((id) => [
    id,
    document.querySelector(
      `#${id.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`,
    ),
  ]),
);
// Explicit aliases for ids that do not map cleanly.
dom.statusBadge = document.querySelector("#status-badge");
dom.canvasWrap = document.querySelector("#canvas-wrap");
dom.loadingLabel = document.querySelector("#loading-label");
dom.loadingError = document.querySelector("#loading-error");
dom.retry = document.querySelector("#retry-loading");
dom.loading = document.querySelector("#loading-screen");
dom.lobby = document.querySelector("#lobby-screen");
dom.game = document.querySelector("#game-screen");
dom.chatPanel = document.querySelector("#chat-panel");
dom.netgraph = document.querySelector("#netgraph");
dom.protocolLabel = document.querySelector("#protocol-label");
dom.netRtt = document.querySelector("#net-rtt");
dom.netAge = document.querySelector("#net-age");
dom.netBytes = document.querySelector("#net-bytes");
dom.netPending = document.querySelector("#net-pending");
dom.netCorrection = document.querySelector("#net-correction");
dom.interpDelay = document.querySelector("#interp-delay");
dom.breakDeterminism = document.querySelector("#break-determinism");
const stars = Array.from({ length: 120 }, (_, index) => ({
  x: ((index * 73) % 997) / 997,
  y: ((index * 151) % 991) / 991,
  size: index % 7 === 0 ? 2 : 1,
  speed: 0.6 + (index % 5) * 0.15,
  phase: index * 0.37,
}));
const hud = createHud(dom, events);
let assets = null;
let loop = null;
let currentPlayerName = "Pilot";
let currentRoom = null;
let joined = false;
let serverJoined = false;
let netGame = null;

function showCanvasLoading(progress, label, error = "") {
  const { ctx, size } = canvasApi;
  ctx.fillStyle = "#020713";
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.fillStyle = "#9be7ff";
  ctx.font = "700 18px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(
    "STARSHIP ARENA — LOADING",
    size.width / 2,
    size.height / 2 - 36,
  );
  ctx.fillStyle = "#5b7089";
  ctx.font = "13px system-ui";
  ctx.fillText(label, size.width / 2, size.height / 2 - 8);
  const barW = Math.min(520, size.width * 0.7);
  const x = (size.width - barW) / 2;
  const y = size.height / 2 + 24;
  ctx.strokeStyle = "rgb(131 204 255 / 30%)";
  ctx.strokeRect(x, y, barW, 18);
  ctx.fillStyle = "#66ddff";
  ctx.fillRect(x + 2, y + 2, Math.max(0, (barW - 4) * progress), 14);
  ctx.fillStyle = "#c9ecff";
  ctx.fillText(`${Math.round(progress * 100)}%`, size.width / 2, y + 46);
  if (error) {
    ctx.fillStyle = "#ffb59f";
    ctx.fillText(error, size.width / 2, y + 72);
  }
}
function appendChat(text, kind = "system") {
  const row = document.createElement("p");
  row.className = `chat-line ${kind}`;
  row.textContent = text;
  dom.chatLog.prepend(row);
  while (dom.chatLog.children.length > 50)
    dom.chatLog.lastElementChild.remove();
}
function renderRoster(players) {
  dom.roster.innerHTML = players
    .map((player) => `<span>${player.name}</span>`)
    .join("");
  dom.rosterCount.textContent = `${players.length} player${players.length === 1 ? "" : "s"}`;
}

function startNetworkGame(joinInfo = {}) {
  joined = true;
  dom.loading.hidden = true;
  dom.lobby.hidden = true;
  dom.game.hidden = false;
  dom.netgraph.hidden = false;
  dom.diagnostics.hidden = false;
  dom.chatPanel.hidden = false;
  dom.statusBadge.textContent = currentRoom.name.toUpperCase();
  dom.room.textContent = currentRoom.name;
  netGame = new NetworkGame({
    connection,
    width: canvasApi.size.width,
    height: canvasApi.size.height,
    input,
    events,
    playerId: joinInfo.playerId ?? null,
    shipId: joinInfo.shipId ?? null,
  });
  netGame.onRoster = renderRoster;
  netGame.onChat = ({ name, text }) => appendChat(`${name}: ${text}`, "user");
  dom.protocolLabel.textContent = connection.protocol.toUpperCase();
  hud.setScore(0);
  mountDiagnostics(dom.diagnostics);
  loop?.stop();
  loop = createLoop({
    step: 1 / 60,
    simulate(dt) {
      netGame?.step(dt);
      input.endFrame();
    },
    render(alpha, stats) {
      const renderState = netGame?.render(performance.now()) ?? {
        entities: [],
        score: 0,
      };
      renderState.roomName = currentRoom?.name ?? "—";
      drawBackground(
        canvasApi.ctx,
        canvasApi.size.width,
        canvasApi.size.height,
        performance.now() / 1000,
        stars,
      );
      drawArenaFrame(
        canvasApi.ctx,
        canvasApi.size.width,
        canvasApi.size.height,
      );
      drawWorld(canvasApi.ctx, renderState, alpha, assets);
      hud.update(stats, renderState);
      updateNetgraph();
    },
  });
  loop.start();
  dom.canvasWrap.focus();
}
function updateNetgraph() {
  if (!netGame) return;
  const stats = netGame.netStats(connection);
  dom.netRtt.textContent = `${stats.rtt.toFixed(0)} ms`;
  dom.netAge.textContent = `${stats.snapshotAge.toFixed(0)} ms`;
  dom.netBytes.textContent = `${stats.bytes.in.toFixed(0)} / ${stats.bytes.out.toFixed(0)} B/s`;
  dom.netPending.textContent = String(stats.pending);
  dom.netCorrection.textContent = `${stats.correction.toFixed(2)} px`;
}

async function boot() {
  dom.loading.hidden = false;
  dom.lobby.hidden = true;
  dom.game.hidden = true;
  dom.netgraph.hidden = true;
  dom.chatPanel.hidden = true;
  dom.diagnostics.hidden = true;
  dom.loadingError.textContent = "";
  dom.retry.hidden = true;
  try {
    showCanvasLoading(0, "Reading assets/manifest.json…");
    const manifest = await loadJson("/assets/manifest.json");
    const decoder = new window.OfflineAudioContext(1, 1, 44100);
    assets = await loadAll(manifest, {
      decoderContext: decoder,
      onProgress: ({ done, total, key }) =>
        showCanvasLoading(done / total, `Loaded ${key} (${done}/${total})`),
    });
    audio.setBuffers(assets.sounds);
    dom.loading.hidden = true;
    dom.lobby.hidden = false;
    mountLobby(dom.lobby, lobby);
    void lobby.start();
    dom.statusBadge.textContent = "LOBBY READY";
  } catch (error) {
    dom.loadingError.textContent = `${error.message ?? "Asset loading failed"}. Use Retry.`;
    dom.retry.hidden = false;
    showCanvasLoading(0, "Loading failed", dom.loadingError.textContent);
  }
}

dom.retry.addEventListener("click", () => void boot());
lobby.addEventListener("joined", (event) => {
  currentRoom = event.detail.room;
  currentPlayerName = event.detail.playerName;
  dom.statusBadge.textContent = "CONNECTING";
  serverJoined = false;
  connection.connect();
});
connection.addEventListener("open", () => {
  dom.statusBadge.textContent = "WS CONNECTED";
  if (currentRoom && !serverJoined)
    connection.send({
      v: 0,
      type: "join",
      room: currentRoom.id,
      name: currentPlayerName,
    });
});
connection.addEventListener("joined", async (event) => {
  if (event.detail.room !== currentRoom?.id) return;
  serverJoined = true;
  await audio.unlock();
  audio.attach(events);
  if (!loop) startNetworkGame(event.detail);
  appendChat(`Joined ${currentRoom.name} via authoritative server.`, "system");
});
connection.addEventListener("roster", (event) =>
  renderRoster(event.detail.players ?? []),
);
connection.addEventListener("chat", (event) =>
  appendChat(`${event.detail.name}: ${event.detail.text}`, "user"),
);
connection.addEventListener("errorMessage", (event) => {
  appendChat(`Server error: ${event.detail.message}`, "system");
  dom.statusBadge.textContent = "JOIN ERROR";
});
connection.addEventListener("reconnecting", (event) => {
  if (joined) appendChat(`Reconnecting in ${event.detail.delay} ms…`, "system");
});
window.setInterval(() => {
  if (serverJoined)
    connection.send({ v: 0, type: "ping", t: performance.now() });
}, 1000);
dom.chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = dom.chatInput.value.trim();
  if (!text || !currentRoom) return;
  connection.send({ v: 0, type: "chat", text });
  dom.chatInput.value = "";
});
dom.leaveRoom.addEventListener("click", () => {
  if (serverJoined) connection.send({ v: 0, type: "leave" });
  connection.close(1000, "left room");
  loop?.stop();
  joined = false;
  serverJoined = false;
  currentRoom = null;
  netGame = null;
  dom.game.hidden = true;
  dom.netgraph.hidden = true;
  dom.chatPanel.hidden = true;
  dom.lobby.hidden = false;
  dom.statusBadge.textContent = "LOBBY READY";
  void lobby.start();
});
window.addEventListener("keydown", (event) => {
  if (event.code === "Space" && !event.repeat && netGame) netGame.fire();
  if (event.code === "KeyR" && netGame?.localShip) {
    /* server reconciliation supplies the real state; R is intentionally no-op */
  }
});
dom.interpDelay.addEventListener("change", () =>
  netGame?.setInterpolationDelay(Number(dom.interpDelay.value)),
);
dom.breakDeterminism.addEventListener("click", () => {
  if (!netGame) return;
  netGame.breakDeterminism = !netGame.breakDeterminism;
  dom.breakDeterminism.textContent = netGame.breakDeterminism
    ? "Fix determinism"
    : "Break determinism";
  dom.breakDeterminism.classList.toggle("active", netGame.breakDeterminism);
});
dom.canvasWrap.addEventListener("pointerdown", () => void audio.unlock());
dom.canvasWrap.addEventListener("click", () => dom.canvasWrap.focus());
window.addEventListener("beforeunload", () => {
  lobby.leave();
  connection.close(1000, "page unload");
  loop?.stop();
  input.destroy();
  canvasApi.destroy();
  audio.dispose();
});
void boot();

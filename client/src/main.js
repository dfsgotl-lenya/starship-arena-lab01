import "./style.css";
import { createInput } from "./input.js";
import { createLoop } from "./loop.js";
import { setupCanvas } from "./render/canvas.js";
import { drawArenaFrame, drawBackground, drawWorld } from "./render/draw.js";
import { World } from "./sim/world.js";
import { Ship } from "./sim/ship.js";
import { loadAll, loadJson } from "./assets/loader.js";
import { createAudioEngine } from "./audio.js";
import { Lobby } from "./lobby/lobby.js";
import { mountLobby } from "./lobby/dom.js";
import { createHud } from "./hud.js";
import { mountDiagnostics } from "./diagnostics.js";
import { GameConnection } from "./connection.js";

const canvas = document.querySelector("#game");
const canvasApi = setupCanvas(canvas);
const events = new window.EventTarget();
const input = createInput(window);
const audio = createAudioEngine();
const lobby = new Lobby();
const connection = new GameConnection();
const dom = {
  loading: document.querySelector("#loading-screen"),
  loadingLabel: document.querySelector("#loading-label"),
  loadingError: document.querySelector("#loading-error"),
  retry: document.querySelector("#retry-loading"),
  lobby: document.querySelector("#lobby-screen"),
  game: document.querySelector("#game-screen"),
  canvasWrap: document.querySelector("#canvas-wrap"),
  statusBadge: document.querySelector("#status-badge"),
  steps: document.querySelector("#steps"),
  frames: document.querySelector("#frames"),
  frameTime: document.querySelector("#frame-time"),
  hp: document.querySelector("#hp"),
  score: document.querySelector("#score"),
  entities: document.querySelector("#entities"),
  activePower: document.querySelector("#active-power"),
  room: document.querySelector("#room"),
  diagnostics: document.querySelector("#diagnostics"),
  chatPanel: document.querySelector("#chat-panel"),
  roster: document.querySelector("#roster"),
  rosterCount: document.querySelector("#roster-count"),
  chatLog: document.querySelector("#chat-log"),
  chatForm: document.querySelector("#chat-form"),
  chatInput: document.querySelector("#chat-input"),
  leaveRoom: document.querySelector("#leave-room"),
};

const stars = Array.from({ length: 120 }, (_, index) => ({
  x: ((index * 73) % 997) / 997,
  y: ((index * 151) % 991) / 991,
  size: index % 7 === 0 ? 2 : 1,
  speed: 0.6 + (index % 5) * 0.15,
  phase: index * 0.37,
}));

const hud = createHud(dom, events);
let assets = null;
let manifest = null;
let world = null;
let loop = null;
let lobbyCleanup = null;
let bootController = null;
let currentPlayerName = "Pilot";
let currentRoom = null;
let joined = false;
let serverJoined = false;

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

function setupWorld(room) {
  world = new World({
    width: canvasApi.size.width,
    height: canvasApi.size.height,
    events,
  });
  world.roomName = room.name;
  world.reset();
  world.width = canvasApi.size.width;
  world.height = canvasApi.size.height;
  world.seed(room.arena);
  const ship = new Ship(world.width / 2, world.height / 2);
  world.spawn(ship);
}

function startGame() {
  if (!world || joined) return;
  joined = true;
  dom.loading.hidden = true;
  dom.lobby.hidden = true;
  dom.game.hidden = false;
  dom.diagnostics.hidden = false;
  dom.chatPanel.hidden = false;
  dom.statusBadge.textContent = currentRoom.name.toUpperCase();
  dom.room.textContent = currentRoom.name;
  hud.setScore(0);
  mountDiagnostics(dom.diagnostics);
  loop?.stop();
  loop = createLoop({
    step: 1 / 60,
    simulate(dt) {
      world.step(dt, { input });
      world.playerShip &&= world.get(world.playerId);
    },
    render(alpha, stats) {
      const { ctx, size } = canvasApi;
      drawBackground(ctx, size.width, size.height, world.time, stars);
      drawArenaFrame(ctx, size.width, size.height);
      drawWorld(ctx, world, alpha, assets);
      hud.update(stats, world);
      input.endFrame();
    },
  });
  loop.start();
  dom.canvasWrap.focus();
}

async function boot() {
  dom.loading.hidden = false;
  dom.lobby.hidden = true;
  dom.game.hidden = true;
  dom.diagnostics.hidden = true;
  dom.chatPanel.hidden = true;
  dom.loadingError.textContent = "";
  dom.retry.hidden = true;
  bootController?.abort();
  bootController = new window.AbortController();
  lobbyCleanup?.();
  lobbyCleanup = null;
  try {
    showCanvasLoading(0, "Reading assets/manifest.json…");
    manifest = await loadJson("/assets/manifest.json", {
      signal: bootController.signal,
    });
    const decoder = new window.OfflineAudioContext(1, 1, 44100);
    assets = await loadAll(manifest, {
      decoderContext: decoder,
      signal: bootController.signal,
      onProgress: ({ done, total, key }) =>
        showCanvasLoading(done / total, `Loaded ${key} (${done}/${total})`),
    });
    audio.setBuffers(assets.sounds);
    dom.loading.hidden = true;
    dom.lobby.hidden = false;
    lobbyCleanup = mountLobby(dom.lobby, lobby);
    void lobby.start();
    dom.statusBadge.textContent = "LOBBY READY";
  } catch (error) {
    if (error?.name === "AbortError") return;
    dom.loadingError.textContent = `${error.message ?? "Asset loading failed"}. Use Retry.`;
    dom.retry.hidden = false;
    showCanvasLoading(0, "Loading failed", dom.loadingError.textContent);
  }
}

dom.retry.addEventListener("click", () => {
  void boot();
});

lobby.addEventListener("joined", (event) => {
  currentRoom = event.detail.room;
  currentPlayerName = event.detail.playerName;
  dom.statusBadge.textContent = "CONNECTING";
  serverJoined = false;
  connection.connect();
});

connection.addEventListener("open", () => {
  dom.statusBadge.textContent = "WS CONNECTED";
  if (currentRoom && !serverJoined) {
    connection.send({
      v: 0,
      type: "join",
      room: currentRoom.id,
      name: currentPlayerName,
    });
  }
});

connection.addEventListener("joined", async (event) => {
  if (event.detail.room !== currentRoom?.id) return;
  serverJoined = true;
  await audio.unlock();
  audio.attach(events);
  setupWorld(currentRoom);
  startGame();
  appendChat(`Joined ${currentRoom.name}.`, "system");
});

connection.addEventListener("roster", (event) => {
  renderRoster(event.detail.players ?? []);
});

connection.addEventListener("chat", (event) => {
  const { name, text } = event.detail;
  appendChat(`${name}: ${text}`, "user");
});

connection.addEventListener("errorMessage", (event) => {
  appendChat(`Server error: ${event.detail.message}`, "system");
  dom.statusBadge.textContent = "JOIN ERROR";
  if (!joined) {
    connection.close(1000, "join rejected");
    currentRoom = null;
    dom.lobby.hidden = false;
    void lobby.start();
  }
});

connection.addEventListener("reconnecting", (event) => {
  if (joined) appendChat(`Reconnecting in ${event.detail.delay} ms…`, "system");
});

connection.addEventListener("close", () => {
  serverJoined = false;
  if (joined) {
    dom.statusBadge.textContent = "WS RECONNECTING";
  }
});

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
  world = null;
  dom.game.hidden = true;
  dom.diagnostics.hidden = true;
  dom.chatPanel.hidden = true;
  dom.lobby.hidden = false;
  dom.statusBadge.textContent = "LOBBY READY";
  void lobby.start();
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" && !event.repeat && world?.playerShip) {
    const bullet = world.playerShip.fire(world);
    if (bullet)
      dom.statusBadge.textContent = bullet.homing ? "HOMING FIRE" : "FIRE";
  }
  if (event.code === "KeyR" && input.justPressed("KeyR") && world) {
    world.reset();
    world.roomName = currentRoom?.name || "Training Ring";
    world.seed(currentRoom?.arena || world.arenaConfig);
    const ship = new Ship(world.width / 2, world.height / 2);
    world.spawn(ship);
  }
});

dom.canvasWrap.addEventListener("pointerdown", () => {
  void audio.unlock();
});
dom.canvasWrap.addEventListener("click", () => dom.canvasWrap.focus());

window.addEventListener("beforeunload", () => {
  bootController?.abort();
  lobby.leave();
  connection.close(1000, "page unload");
  loop?.stop();
  input.destroy();
  canvasApi.destroy();
  audio.dispose();
});

void boot();

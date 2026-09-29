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
import { runOrderingPuzzles } from "./async/puzzles.js";
import { mountDiagnostics } from "./diagnostics.js";

const canvas = document.querySelector("#game");
const canvasApi = setupCanvas(canvas);
const events = new window.EventTarget();
const input = createInput(window);
const audio = createAudioEngine();
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
  diagnosticsLog: document.querySelector("#diagnostics-log"),
};

const stars = Array.from({ length: 120 }, (_, index) => ({
  x: ((index * 73) % 997) / 997,
  y: ((index * 151) % 991) / 991,
  size: index % 7 === 0 ? 2 : 1,
  speed: 0.6 + (index % 5) * 0.15,
  phase: index * 0.37,
}));

const hud = createHud(dom, events);
const lobby = new Lobby();
let assets = null;
let manifest = null;
let world = null;
let loop = null;
let lobbyCleanup = null;
let bootController = null;

function showCanvasLoading(progress, label, error = "") {
  const { ctx, size } = canvasApi;
  const barW = Math.min(520, size.width * 0.7);
  const x = (size.width - barW) / 2;
  const y = size.height / 2 + 32;
  ctx.fillStyle = "#020713";
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.fillStyle = "#9be7ff";
  ctx.font = "700 18px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("STARSHIP ARENA — LOADING", size.width / 2, size.height / 2 - 28);
  ctx.fillStyle = "#5b7089";
  ctx.font = "13px system-ui";
  ctx.fillText(label, size.width / 2, size.height / 2);
  ctx.strokeStyle = "rgb(131 204 255 / 30%)";
  ctx.strokeRect(x, y, barW, 18);
  ctx.fillStyle = "#66ddff";
  ctx.fillRect(x + 2, y + 2, Math.max(0, (barW - 4) * progress), 14);
  ctx.fillStyle = "#c9ecff";
  ctx.fillText(`${Math.round(progress * 100)}%`, size.width / 2, y + 50);
  if (error) {
    ctx.fillStyle = "#ffb59f";
    ctx.fillText(error, size.width / 2, y + 78);
  }
}


async function boot() {
  dom.loading.hidden = false;
  dom.lobby.hidden = true;
  dom.game.hidden = true;
  dom.diagnostics.hidden = true;
  dom.loadingError.textContent = "";
  dom.retry.hidden = true;
  bootController?.abort();
  bootController = new window.AbortController();
  lobbyCleanup?.();
  lobbyCleanup = null;
  try {
    showCanvasLoading(0, "Reading assets/manifest.json…");
    manifest = await loadJson("/assets/manifest.json", { signal: bootController.signal });
    const decoder = new window.OfflineAudioContext(1, 1, 44100);
    let latestProgress = 0;
    assets = await loadAll(manifest, {
      decoderContext: decoder,
      signal: bootController.signal,
      onProgress: ({ done, total, key }) => {
        latestProgress = done / total;
        showCanvasLoading(latestProgress, `Loaded ${key} (${done}/${total})`);
      },
      onRetry: ({ key, attempt, waitMs, kind }) => {
        showCanvasLoading(latestProgress, `Retry ${kind} ${key}: attempt ${attempt + 1} in ${waitMs} ms`);
      },
    });
    audio.setBuffers(assets.sounds);
    events.dispatchEvent(new window.CustomEvent("assetsReady", { detail: assets }));
    dom.loading.hidden = true;
    dom.lobby.hidden = false;
    lobbyCleanup = mountLobby(dom.lobby, lobby);
    void lobby.start();
    dom.statusBadge.textContent = "LOBBY READY";
    runOrderingPuzzles();
    window.Promise.all([window.Promise.resolve("sprite"), window.Promise.resolve("audio")]).then((value) => window.console.log("[Lab 03] Promise.all:", value));
    window.Promise.allSettled([window.Promise.resolve("ok"), window.Promise.reject(new Error("demo"))]).then((value) => window.console.log("[Lab 03] Promise.allSettled:", value));
    window.Promise.race([new window.Promise((r) => window.setTimeout(() => r("slow"), 20)), new window.Promise((r) => window.setTimeout(() => r("fast"), 5))]).then((value) => window.console.log("[Lab 03] Promise.race:", value));
    window.Promise.any([window.Promise.reject(new Error("x")), window.Promise.resolve("mirror")] ).then((value) => window.console.log("[Lab 03] Promise.any:", value));
  } catch (error) {
    if (error?.name === "AbortError") return;
    bootController?.abort();
    window.console.error("[Lab 03] Asset pipeline failed:", error);
    dom.loadingError.textContent = `${error.message ?? "Asset loading failed"}. Use Retry.`;
    dom.retry.hidden = false;
    showCanvasLoading(0, "Loading failed", dom.loadingError.textContent);
  }
}

dom.retry.addEventListener("click", () => { void boot(); });

lobby.addEventListener("joined", async (event) => {
  lobbyCleanup?.();
  dom.lobby.hidden = true;
  dom.game.hidden = false;
  dom.diagnostics.hidden = false;
  try {
    await audio.unlock();
  } catch (error) {
    window.console.warn("[Lab 03] Audio unlock failed:", error);
  }
  audio.attach(events);
  const { room, playerName } = event.detail;
  world = new World({ width: canvasApi.size.width, height: canvasApi.size.height, events });
  world.roomName = room.name;
  world.reset();
  world.width = canvasApi.size.width;
  world.height = canvasApi.size.height;
  world.seed(room.arena);
  world.playerId = null;
  world.playerShip = null;
  const ship = new Ship(world.width / 2, world.height / 2);
  world.spawn(ship);
  dom.statusBadge.textContent = room.name.toUpperCase();
  hud.setStatus(`Player: ${playerName}`);
  hud.setScore(0);
  mountDiagnostics(dom.diagnostics, { events });

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
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" && !event.repeat && world?.playerShip) {
    const bullet = world.playerShip.fire(world);
    if (bullet) dom.statusBadge.textContent = bullet.homing ? "HOMING FIRE" : "FIRE";
  }
  if (event.code === "KeyR" && input.justPressed("KeyR") && world) {
    world.reset();
    world.roomName = world.roomName || "Training Ring";
    world.seed(world.arenaConfig);
    const ship = new Ship(world.width / 2, world.height / 2);
    world.spawn(ship);
  }
});

dom.canvasWrap.addEventListener("pointerdown", () => { void audio.unlock(); });

dom.canvasWrap.addEventListener("click", () => dom.canvasWrap.focus());

window.addEventListener("beforeunload", () => {
  bootController?.abort();
  lobby.leave();
  loop?.stop();
  input.destroy();
  canvasApi.destroy();
  audio.dispose();
});

void boot();

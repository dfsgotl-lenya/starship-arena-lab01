import "./style.css";
import { createInput } from "./input.ts";
import { createLoop } from "./loop.ts";
import { setupCanvas } from "./render/canvas.ts";
import { drawArenaFrame, drawBackground, drawWorld } from "./render/draw.ts";
import { loadAll, loadJson, parseAssetManifest } from "./assets/loader.ts";
import type { LoadedAssets, ProgressInfo } from "./assets/loader.ts";
import { createAudioEngine } from "./audio.ts";
import { Lobby, RoomListSchema } from "./lobby/lobby.ts";
import type { LobbyRoom } from "./types.ts";
import { mountLobby } from "./lobby/dom.ts";
import { mountDiagnostics } from "./diagnostics.ts";
import { createHud } from "./hud.ts";
import type { HudElements } from "./hud.ts";
import { GameConnection } from "./connection.ts";
import { NetworkGame } from "./netcode/game-client.ts";
import { Bus } from "./events.ts";
import type { GameEvents } from "./events.ts";
import type { LoopStats, RenderWorld } from "./types.ts";
import { ServerMessageSchema } from "@starship-arena/shared/protocol/index.ts";
import { FrameRecorder } from "./perf.ts";

interface AppDom extends HudElements {
  readonly loading: HTMLElement;
  readonly loadingLabel: HTMLElement;
  readonly loadingError: HTMLElement;
  readonly retry: HTMLButtonElement;
  readonly lobby: HTMLElement;
  readonly game: HTMLElement;
  readonly canvasWrap: HTMLElement;
  readonly diagnostics: HTMLElement;
  readonly chatPanel: HTMLElement;
  readonly roster: HTMLElement;
  readonly rosterCount: HTMLElement;
  readonly chatLog: HTMLElement;
  readonly chatForm: HTMLFormElement;
  readonly chatInput: HTMLInputElement;
  readonly leaveRoom: HTMLButtonElement;
  readonly netgraph: HTMLElement;
  readonly protocolLabel: HTMLElement;
  readonly netRtt: HTMLElement;
  readonly netAge: HTMLElement;
  readonly netBytes: HTMLElement;
  readonly netPending: HTMLElement;
  readonly netCorrection: HTMLElement;
  readonly interpDelay: HTMLInputElement;
  readonly breakDeterminism: HTMLButtonElement;
}
function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Required UI element missing: ${selector}`);
  return element;
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function customDetail(event: Event): unknown {
  return event instanceof CustomEvent ? event.detail : undefined;
}

const canvas = required<HTMLCanvasElement>("#game");
const canvasApi = setupCanvas(canvas);
const events = new Bus<GameEvents>();
const input = createInput(window);
const audio = createAudioEngine();
const lobby = new Lobby();
const connection = new GameConnection();
const dom: AppDom = {
  loading: required("#loading-screen"),
  loadingLabel: required("#loading-label"),
  loadingError: required("#loading-error"),
  retry: required("#retry-loading"),
  lobby: required("#lobby-screen"),
  game: required("#game-screen"),
  canvasWrap: required("#canvas-wrap"),
  statusBadge: required("#status-badge"),
  steps: required("#steps"),
  frames: required("#frames"),
  frameTime: required("#frame-time"),
  hp: required("#hp"),
  score: required("#score"),
  entities: required("#entities"),
  activePower: required("#active-power"),
  room: required("#room"),
  diagnostics: required("#diagnostics"),
  chatPanel: required("#chat-panel"),
  roster: required("#roster"),
  rosterCount: required("#roster-count"),
  chatLog: required("#chat-log"),
  chatForm: required<HTMLFormElement>("#chat-form"),
  chatInput: required<HTMLInputElement>("#chat-input"),
  leaveRoom: required<HTMLButtonElement>("#leave-room"),
  netgraph: required("#netgraph"),
  protocolLabel: required("#protocol-label"),
  netRtt: required("#net-rtt"),
  netAge: required("#net-age"),
  netBytes: required("#net-bytes"),
  netPending: required("#net-pending"),
  netCorrection: required("#net-correction"),
  interpDelay: required<HTMLInputElement>("#interp-delay"),
  breakDeterminism: required<HTMLButtonElement>("#break-determinism"),
};
const stars = Array.from({ length: 120 }, (_, index) => ({
  x: ((index * 73) % 997) / 997,
  y: ((index * 151) % 991) / 991,
  size: index % 7 === 0 ? 2 : 1,
  speed: 0.6 + (index % 5) * 0.15,
  phase: index * 0.37,
}));
const hud = createHud(dom, events);
const pageParams = new URLSearchParams(window.location.search);
const recorder = new FrameRecorder(pageParams.get("perf") === "1");
let lastEntityCount = 0;
window.__perf = {
  recorder,
  start: () => recorder.start(),
  stop: () => recorder.stop(),
  entities: () => lastEntityCount,
};
let assets: LoadedAssets | null = null;
let loop: ReturnType<typeof createLoop> | null = null;
let currentPlayerName = "Pilot";
let currentRoom: LobbyRoom | null = null;
let joined = false;
let serverJoined = false;
let netGame: NetworkGame | null = null;

function showCanvasLoading(progress: number, label: string, error = ""): void {
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
function appendChat(text: string, kind = "system"): void {
  const row = document.createElement("p");
  row.className = `chat-line ${kind}`;
  row.textContent = text;
  dom.chatLog.prepend(row);
  while (dom.chatLog.children.length > 50)
    dom.chatLog.lastElementChild?.remove();
}
function renderRoster(players: readonly { readonly name: string }[]): void {
  dom.roster.innerHTML = players
    .map((player) => `<span>${escapeHtml(player.name)}</span>`)
    .join("");
  dom.rosterCount.textContent = `${players.length} player${players.length === 1 ? "" : "s"}`;
}

function startNetworkGame(): void {
  if (!currentRoom || !assets) return;
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
  });
  netGame.onRoster = renderRoster;
  netGame.onChat = ({ name, text }) => appendChat(`${name}: ${text}`, "user");
  dom.protocolLabel.textContent = connection.protocol.toUpperCase();
  hud.setScore(0);
  mountDiagnostics(dom.diagnostics);
  loop?.stop();
  loop = createLoop({
    step: 1 / 60,
    recorder,
    simulate(dt) {
      netGame?.step(dt);
      input.endFrame();
    },
    render(alpha: number, stats: LoopStats) {
      const gameState = netGame?.render(performance.now()) ?? {
        entities: [],
        score: 0,
      };
      const renderState: RenderWorld = {
        ...gameState,
        roomName: currentRoom?.name ?? "—",
      };
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
      if (assets) drawWorld(canvasApi.ctx, renderState, alpha, assets);
      lastEntityCount = renderState.entities.length;
      hud.update(stats, renderState);
      updateNetgraph();
    },
  });
  loop.start();
  dom.canvasWrap.focus();
}
function updateNetgraph(): void {
  if (!netGame) return;
  const stats = netGame.netStats();
  dom.netRtt.textContent = `${stats.rtt.toFixed(0)} ms`;
  dom.netAge.textContent = `${stats.snapshotAge.toFixed(0)} ms`;
  dom.netBytes.textContent = `${stats.bytes.in.toFixed(0)} / ${stats.bytes.out.toFixed(0)} B/s`;
  dom.netPending.textContent = String(stats.pending);
  dom.netCorrection.textContent = `${stats.correction.toFixed(2)} px`;
}

async function boot(): Promise<void> {
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
    const manifest = parseAssetManifest(
      await loadJson("/assets/manifest.json"),
    );
    const decoder = new OfflineAudioContext(1, 1, 44100);
    assets = await loadAll(manifest, {
      decoderContext: decoder,
      onProgress: ({ done, total, key }: ProgressInfo) =>
        showCanvasLoading(done / total, `Loaded ${key} (${done}/${total})`),
    });
    audio.setBuffers(assets.sounds ?? {});
    dom.loading.hidden = true;
    dom.lobby.hidden = false;
    mountLobby(dom.lobby, lobby);
    void lobby.start();
    dom.statusBadge.textContent = "LOBBY READY";
  } catch (error: unknown) {
    dom.loadingError.textContent = `${errorMessage(error) || "Asset loading failed"}. Use Retry.`;
    dom.retry.hidden = false;
    showCanvasLoading(0, "Loading failed", dom.loadingError.textContent);
  }
}

dom.retry.addEventListener("click", () => {
  void boot();
});
lobby.addEventListener("joined", (event: Event) => {
  const detail: unknown = customDetail(event);
  if (
    typeof detail !== "object" ||
    detail === null ||
    !("room" in detail) ||
    !("playerName" in detail) ||
    typeof detail.playerName !== "string"
  )
    return;
  const parsedRoom = RoomListSchema.safeParse({ rooms: [detail.room] });
  const room = parsedRoom.success ? parsedRoom.data.rooms[0] : undefined;
  if (!room) return;
  currentRoom = room;
  currentPlayerName = detail.playerName;
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
connection.addEventListener("joined", async (event: Event) => {
  const parsed = ServerMessageSchema.safeParse(customDetail(event));
  if (
    !parsed.success ||
    parsed.data.type !== "joined" ||
    parsed.data.room !== currentRoom?.id
  )
    return;
  serverJoined = true;
  try {
    await audio.unlock();
    audio.attach(events);
  } catch (error: unknown) {
    appendChat(`Audio unavailable: ${errorMessage(error)}`, "system");
  }
  if (!loop) startNetworkGame();
  if (currentRoom)
    appendChat(
      `Joined ${currentRoom.name} via authoritative server.`,
      "system",
    );
});
connection.addEventListener("roster", (event: Event) => {
  const parsed = ServerMessageSchema.safeParse(customDetail(event));
  if (parsed.success && parsed.data.type === "roster")
    renderRoster(parsed.data.players);
});
connection.addEventListener("chat", (event: Event) => {
  const parsed = ServerMessageSchema.safeParse(customDetail(event));
  if (parsed.success && parsed.data.type === "chat")
    appendChat(`${parsed.data.name}: ${parsed.data.text}`, "user");
});
connection.addEventListener("errorMessage", (event: Event) => {
  const parsed = ServerMessageSchema.safeParse(customDetail(event));
  if (parsed.success && parsed.data.type === "errorMessage") {
    appendChat(`Server error: ${parsed.data.message}`, "system");
    dom.statusBadge.textContent = "JOIN ERROR";
  }
});
connection.addEventListener("reconnecting", (event: Event) => {
  const detail: unknown = customDetail(event);
  if (
    joined &&
    typeof detail === "object" &&
    detail !== null &&
    "delay" in detail &&
    typeof detail.delay === "number"
  )
    appendChat(`Reconnecting in ${detail.delay} ms…`, "system");
});
window.setInterval(() => {
  if (serverJoined)
    connection.send({ v: 0, type: "ping", t: performance.now() });
}, 1000);
dom.chatForm.addEventListener("submit", (event: SubmitEvent) => {
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
window.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.code === "Space" && !event.repeat && netGame) netGame.fire();
  if (event.code === "KeyR" && netGame?.localShip) {
    /* Server reconciliation supplies the authoritative state; R is intentionally a no-op. */
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
dom.canvasWrap.addEventListener("pointerdown", () => {
  void audio.unlock();
});
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

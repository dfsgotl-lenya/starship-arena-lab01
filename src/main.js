import "./style.css";
import { createInput } from "./input.js";
import { createLoop, createVariableLoop } from "./loop.js";
import { createShip, cloneShip, integrate } from "./sim/ship.js";
import { wrapShipToArena } from "./sim/arena.js";
import { setupCanvas } from "./render/canvas.js";
import {
  drawArenaFrame,
  drawBackground,
  drawHud,
  drawShip,
  interpolateShip,
} from "./render/draw.js";
import { busyWait, createIntervalExperiment } from "./experiments/experiments.js";

const canvas = document.querySelector("#game");
const canvasWrap = document.querySelector("#canvas-wrap");
const input = createInput(window);
const message = document.querySelector("#message");
const statusBadge = document.querySelector("#status-badge");

const dom = {
  steps: document.querySelector("#steps"),
  frames: document.querySelector("#frames"),
  frameTime: document.querySelector("#frame-time"),
  position: document.querySelector("#position"),
  velocity: document.querySelector("#velocity"),
  dpr: document.querySelector("#dpr"),
  busyCount: document.querySelector("#busy-count"),
  intervalFps: document.querySelector("#interval-fps"),
  intervalJitter: document.querySelector("#interval-jitter"),
  intervalRange: document.querySelector("#interval-range"),
  intervalCallbacks: document.querySelector("#interval-callbacks"),
  variablePos: document.querySelector("#variable-pos"),
};

const stars = Array.from({ length: 110 }, (_, index) => ({
  x: ((index * 73) % 997) / 997,
  y: ((index * 151) % 991) / 991,
  size: index % 7 === 0 ? 2 : 1,
  speed: 0.6 + (index % 5) * 0.15,
  phase: index * 0.37,
}));

const canvasApi = setupCanvas(canvas);
let ship = createShip(320, 240);
let previousShip = cloneShip(ship);
let simulationTime = 0;
let busyExperiment = false;
let busyCount = 0;
let variableTimestep = false;
let activeLoop = null;

const intervalExperiment = createIntervalExperiment({
  onProgress: ({ count, elapsed, durationMs }) => {
    message.hidden = false;
    const seconds = Math.min(elapsed, durationMs) / 1000;
    message.textContent = `setInterval test: ${count} callbacks / ${seconds.toFixed(1)} s...`;
  },
  onComplete: (result) => {
    dom.intervalFps.textContent = `${result.fps.toFixed(1)} fps`;
    dom.intervalJitter.textContent = `${result.jitterMs.toFixed(2)} ms`;
    dom.intervalRange.textContent = `${result.minMs.toFixed(2)}–${result.maxMs.toFixed(2)} ms`;
    dom.intervalCallbacks.textContent = String(result.callbacks);
    message.hidden = false;
    message.textContent =
      `Experiment 2 complete: ${result.callbacks} callbacks in ` +
      `${(result.elapsedMs / 1000).toFixed(2)} s.`;
    document.querySelector("#interval-run").disabled = false;
    setStatus("FIXED 60 Hz");
  },
});

function resetShip() {
  const { width, height } = canvasApi.size;
  ship = createShip(width / 2, height / 2);
  previousShip = cloneShip(ship);
  simulationTime = 0;
}

function simulate(step) {
  previousShip = cloneShip(ship);
  ship = integrate(ship, input, step);
  ship = wrapShipToArena(ship, canvasApi.size.width, canvasApi.size.height);
  simulationTime += step;
}

function render(alpha, stats) {
  const { ctx, size } = canvasApi;
  const interpolated = interpolateShip(previousShip, ship, alpha);

  drawBackground(ctx, size.width, size.height, simulationTime, stars);
  drawArenaFrame(ctx, size.width, size.height);
  drawShip(ctx, interpolated);
  drawHud(dom, stats, interpolated, size.dpr);

  if (busyExperiment && Math.round(stats.totalFrames ?? 0) % 60 === 0) {
    busyWait(100);
    busyCount += 1;
    dom.busyCount.textContent = String(busyCount);
  }

  input.endFrame();
}

const fixedLoop = createLoop({
  step: 1 / 60,
  simulate,
  render,
});

const variableLoop = createVariableLoop({
  simulate,
  render,
});

function useFixedLoop() {
  variableLoop.stop();
  fixedLoop.start();
  activeLoop = fixedLoop;
}

function useVariableLoop() {
  fixedLoop.stop();
  variableLoop.start();
  activeLoop = variableLoop;
}

function setStatus(text) {
  statusBadge.textContent = text;
}

document.querySelector("#busy-toggle").addEventListener("click", (event) => {
  busyExperiment = !busyExperiment;
  event.currentTarget.classList.toggle("active", busyExperiment);
  message.hidden = false;
  message.textContent = busyExperiment
    ? "Experiment 1 ON: 100 ms synchronous block every 60th frame."
    : "Experiment 1 OFF: normal rAF loop restored.";
  setStatus(busyExperiment ? "EXPERIMENT 1" : "FIXED 60 Hz");
});

document.querySelector("#interval-run").addEventListener("click", (event) => {
  event.currentTarget.disabled = true;
  dom.intervalFps.textContent = "running…";
  dom.intervalJitter.textContent = "running…";
  dom.intervalRange.textContent = "running…";
  dom.intervalCallbacks.textContent = "0";
  message.hidden = false;
  message.textContent = "Experiment 2 running for 10 s. Switch to another tab for ~5 s, then return.";
  setStatus("EXPERIMENT 2");
  intervalExperiment.start(10_000);
});

document.querySelector("#variable-toggle").addEventListener("click", (event) => {
  variableTimestep = !variableTimestep;
  event.currentTarget.classList.toggle("active", variableTimestep);
  setStatus(variableTimestep ? "VARIABLE DT" : "FIXED 60 Hz");
  message.hidden = false;
  message.textContent = variableTimestep
    ? "Variable timestep mode ON. Hold W/↑ for 5 s, then record POS; repeat with CPU 6×."
    : "Fixed timestep restored.";

  if (variableTimestep) {
    useVariableLoop();
  } else {
    useFixedLoop();
  }
});

document.querySelector("#reset-experiments").addEventListener("click", (event) => {
  busyExperiment = false;
  variableTimestep = false;
  busyCount = 0;
  dom.busyCount.textContent = "0";
  dom.intervalFps.textContent = "—";
  dom.intervalJitter.textContent = "—";
  dom.intervalRange.textContent = "—";
  dom.intervalCallbacks.textContent = "0";
  dom.variablePos.textContent = "—";
  intervalExperiment.stop();
  useFixedLoop();
  document.querySelectorAll(".lab-button.active").forEach((button) => button.classList.remove("active"));
  event.currentTarget.blur();
  message.hidden = true;
  setStatus("FIXED 60 Hz");
  resetShip();
});

window.addEventListener("keydown", (event) => {
  if (input.justPressed("KeyR")) resetShip();
});

canvasWrap.addEventListener("click", () => canvas.focus());
window.addEventListener("beforeunload", () => {
  activeLoop?.stop();
  intervalExperiment.stop();
  input.destroy();
  canvasApi.destroy();
});

useFixedLoop();

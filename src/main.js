import "./style.css";
import { createInput } from "./input.js";
import { createLoop } from "./loop.js";
import { setupCanvas } from "./render/canvas.js";
import { drawArenaFrame, drawBackground, drawHud, drawWorld } from "./render/draw.js";
import { World } from "./sim/world.js";
import { Ship } from "./sim/ship.js";

const canvas = document.querySelector("#game");
const canvasWrap = document.querySelector("#canvas-wrap");
const message = document.querySelector("#message");
const statusBadge = document.querySelector("#status-badge");
const input = createInput(window);

const dom = {
  steps: document.querySelector("#steps"),
  frames: document.querySelector("#frames"),
  frameTime: document.querySelector("#frame-time"),
  hp: document.querySelector("#hp"),
  score: document.querySelector("#score"),
  entities: document.querySelector("#entities"),
  activePower: document.querySelector("#active-power"),
};

const stars = Array.from({ length: 120 }, (_, index) => ({
  x: ((index * 73) % 997) / 997,
  y: ((index * 151) % 991) / 991,
  size: index % 7 === 0 ? 2 : 1,
  speed: 0.6 + (index % 5) * 0.15,
  phase: index * 0.37,
}));

let world;

const canvasApi = setupCanvas(canvas, ({ width, height }) => {
  if (world) {
    world.width = width;
    world.height = height;
  }
});

world = new World({
  width: canvasApi.size.width,
  height: canvasApi.size.height,
  onScore: (score) => {
    dom.score.textContent = String(score);
  },
});

function setMessage(text) {
  message.hidden = false;
  message.textContent = text;
  window.clearTimeout(setMessage.timer);
  setMessage.timer = window.setTimeout(() => {
    message.hidden = true;
  }, 2500);
}

function resetWorld() {
  world.reset();
  world.width = canvasApi.size.width;
  world.height = canvasApi.size.height;
  world.seed();
  const ship = new Ship(world.width / 2, world.height / 2);
  world.spawn(ship);
  setMessage("Lab 02 ready: fly, shoot, collect pickups and destroy asteroids.");
}

resetWorld();

// Required console experiment: prototypes + detached this.
function runConsoleExperiments() {
  const proto = { hello() { return "hello from prototype"; } };
  const a = Object.create(proto);
  const b = Object.create(proto);
  a.hello = () => "hello from a";
  window.console.log("[Lab 02] Prototype delegation:", { a: a.hello(), b: b.hello(), shared: Object.getPrototypeOf(b) === proto });

  const demoShip = new Ship(0, 0);
  const detachedFire = demoShip.fire;
  try {
    detachedFire(world);
  } catch (error) {
    window.console.log("[Lab 02] Deliberate this bug:", error.message);
  }
  window.console.log("[Lab 02] Fixed keyboard handler: () => world.playerShip?.fire(world)");

  const objectDict = { "1": "x" };
  const map = new Map([[1, "x"]]);
  window.console.log("[Lab 02] Object vs Map keys:", { object1: objectDict[1], map1: map.get(1), mapString1: map.get("1") });
}
runConsoleExperiments();

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" && !event.repeat) {
    // Chosen fix for the `this` bug: arrow callback keeps the correct receiver.
    const bullet = world.playerShip?.fire(world);
    if (bullet) statusBadge.textContent = bullet.homing ? "HOMING FIRE" : "FIRE";
  }

  if (event.code === "KeyR" && input.justPressed("KeyR")) resetWorld();
});

canvasWrap.addEventListener("click", () => canvas.focus());

const loop = createLoop({
  step: 1 / 60,
  simulate(dt) {
    world.step(dt, { input });
    world.playerShip &&= world.get(world.playerId);
  },
  render(alpha, stats) {
    const { ctx, size } = canvasApi;
    drawBackground(ctx, size.width, size.height, world.time, stars);
    drawArenaFrame(ctx, size.width, size.height);
    drawWorld(ctx, world, alpha);
    drawHud(dom, stats, world);
    input.endFrame();
  },
});

loop.start();

// Small composition demo: the same homing behavior is used by bullets and asteroids.
window.console.log("[Lab 02] Composition:", "Bullet.homing and Asteroid.homing are independent behavior components.");
window.console.log("[Lab 02] World entities:", "Map", "ofKind()", "iterable", "deferred sweep");

window.addEventListener("beforeunload", () => {
  loop.stop();
  input.destroy();
  canvasApi.destroy();
});

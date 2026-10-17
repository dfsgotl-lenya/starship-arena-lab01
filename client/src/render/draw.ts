import type {
  Assets,
  ClientEntity,
  RenderWorld,
  SpriteSheet,
} from "../types.ts";
const TAU = Math.PI * 2;

function lerp(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha;
}
function lerpAngle(a: number, b: number, alpha: number): number {
  let delta = ((b - a + Math.PI) % TAU) - Math.PI;
  if (delta < -Math.PI) delta += TAU;
  return a + delta * alpha;
}
function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
): void {
  ctx.save();
  ctx.strokeStyle = "rgb(74 134 173 / 18%)";
  ctx.lineWidth = 1;
  const grid = 64;
  const offset = (time * 6) % grid;
  for (let x = -grid + offset; x < width + grid; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = -grid + offset; y < height + grid; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** The gradient only depends on height: build it once, not every frame. */
let cachedGradient: CanvasGradient | null = null;
let cachedGradientCtx: CanvasRenderingContext2D | null = null;
let cachedGradientHeight = -1;
function backgroundGradient(
  ctx: CanvasRenderingContext2D,
  height: number,
): CanvasGradient {
  if (
    cachedGradient &&
    cachedGradientCtx === ctx &&
    cachedGradientHeight === height
  )
    return cachedGradient;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#020713");
  gradient.addColorStop(0.55, "#071425");
  gradient.addColorStop(1, "#02080f");
  cachedGradient = gradient;
  cachedGradientCtx = ctx;
  cachedGradientHeight = height;
  return gradient;
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  stars: readonly {
    x: number;
    y: number;
    size: number;
    speed: number;
    phase: number;
  }[],
): void {
  ctx.fillStyle = backgroundGradient(ctx, height);
  ctx.fillRect(0, 0, width, height);
  drawGrid(ctx, width, height, time);
  ctx.save();
  for (const star of stars) {
    ctx.globalAlpha = 0.45 + Math.sin(time * star.speed + star.phase) * 0.2;
    ctx.fillStyle = "#d9f6ff";
    ctx.fillRect(star.x * width, star.y * height, star.size, star.size);
  }
  ctx.restore();
}

export function drawArenaFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx.save();
  ctx.strokeStyle = "rgb(101 215 255 / 30%)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
  ctx.restore();
}

/** Reused scratch result: Lab 6 returned a new {x, y, angle} per entity per frame. */
const position = { x: 0, y: 0, angle: 0 };
function renderPos(entity: ClientEntity, alpha: number): typeof position {
  position.x = lerp(entity.prevX ?? entity.x, entity.x, alpha);
  position.y = lerp(entity.prevY ?? entity.y, entity.y, alpha);
  position.angle = lerpAngle(
    entity.prevAngle ?? entity.angle,
    entity.angle,
    alpha,
  );
  return position;
}
function drawSprite(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet | undefined,
  frame: number,
  x: number,
  y: number,
  width: number,
  height: number,
  angle = 0,
  scale = 1,
): void {
  if (!sheet?.image) return;
  const cols = sheet.frames ?? 4;
  const sw = sheet.frameWidth;
  const sh = sheet.frameHeight;
  const index = frame % cols;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(
    sheet.image,
    index * sw,
    0,
    sw,
    sh,
    (-width * scale) / 2,
    (-height * scale) / 2,
    width * scale,
    height * scale,
  );
  ctx.restore();
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  world: RenderWorld,
  alpha: number,
  assets: Assets,
): void {
  const now = performance.now();
  const shipFrame = Math.floor((now / 120) % 4);
  const bulletFrame = Math.floor((now / 90) % 4);
  const entities = world.entities;
  for (let index = 0; index < entities.length; index += 1) {
    const entity = entities[index]!;
    const position = renderPos(entity, alpha);
    switch (entity.kind) {
      case "ship":
        drawSprite(
          ctx,
          assets.sprites["ship"],
          shipFrame,
          position.x,
          position.y,
          48,
          48,
          position.angle,
          1,
        );
        break;
      case "bullet":
        drawSprite(
          ctx,
          assets.sprites["bullet"],
          bulletFrame,
          position.x,
          position.y,
          24,
          24,
          position.angle,
          1,
        );
        break;
      case "asteroid":
        drawSprite(
          ctx,
          assets.sprites["asteroid"],
          entity.variant ?? Number(entity.id) % 4,
          position.x,
          position.y,
          64,
          64,
          position.angle,
          1,
        );
        break;
      case "pickup":
        break;
      default:
        assertNever(entity.kind);
    }
  }
}
function assertNever(value: never): never {
  throw new Error(`Unrendered entity kind: ${String(value)}`);
}

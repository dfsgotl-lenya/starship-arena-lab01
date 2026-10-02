const TAU = Math.PI * 2;

function lerp(a, b, alpha) {
  return a + (b - a) * alpha;
}
function lerpAngle(a, b, alpha) {
  let delta = ((b - a + Math.PI) % TAU) - Math.PI;
  if (delta < -Math.PI) delta += TAU;
  return a + delta * alpha;
}

function drawGrid(ctx, width, height, time) {
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

export function drawBackground(ctx, width, height, time, stars) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#020713");
  gradient.addColorStop(0.55, "#071425");
  gradient.addColorStop(1, "#02080f");
  ctx.fillStyle = gradient;
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

export function drawArenaFrame(ctx, width, height) {
  ctx.save();
  ctx.strokeStyle = "rgb(101 215 255 / 30%)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
  ctx.restore();
}

function renderPos(entity, alpha) {
  return {
    x: lerp(entity.prevX ?? entity.x, entity.x, alpha),
    y: lerp(entity.prevY ?? entity.y, entity.y, alpha),
    angle: lerpAngle(
      entity.prevAngle ?? entity.angle ?? 0,
      entity.angle ?? 0,
      alpha,
    ),
  };
}
function drawSprite(
  ctx,
  sheet,
  frame,
  x,
  y,
  width,
  height,
  angle = 0,
  scale = 1,
) {
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

export function drawWorld(ctx, world, alpha, assets) {
  for (const entity of world.entities ?? []) {
    const p = renderPos(entity, alpha);
    if (entity.kind === "ship")
      drawSprite(
        ctx,
        assets.sprites.ship,
        Math.floor((performance.now() / 120) % 4),
        p.x,
        p.y,
        48,
        48,
        p.angle,
        1,
      );
    else if (entity.kind === "bullet")
      drawSprite(
        ctx,
        assets.sprites.bullet,
        Math.floor((performance.now() / 90) % 4),
        p.x,
        p.y,
        24,
        24,
        p.angle,
        1,
      );
    else if (entity.kind === "asteroid")
      drawSprite(
        ctx,
        assets.sprites.asteroid,
        entity.variant ?? entity.id % 4,
        p.x,
        p.y,
        64,
        64,
        p.angle,
        1,
      );
  }
}

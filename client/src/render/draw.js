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

function getRenderPos(entity, alpha) {
  return {
    x: lerp(entity.prevPos.x, entity.pos.x, alpha),
    y: lerp(entity.prevPos.y, entity.pos.y, alpha),
    angle: lerpAngle(entity.prevAngle, entity.angle, alpha),
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
  ctx.imageSmoothingEnabled = true;
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

function drawShip(ctx, entity, alpha, assets) {
  const p = getRenderPos(entity, alpha);
  const pulse = Math.floor((window.performance.now() / 120) % 4);
  drawSprite(ctx, assets.sprites.ship, pulse, p.x, p.y, 48, 48, p.angle, 1);
  if (entity.shieldTime > 0) {
    ctx.save();
    ctx.strokeStyle = "rgb(105 215 255 / 70%)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      p.x,
      p.y,
      entity.radius + 8 + Math.sin(window.performance.now() * 0.008) * 2,
      0,
      TAU,
    );
    ctx.stroke();
    ctx.restore();
  }
}

function drawBullet(ctx, entity, alpha, assets) {
  const p = getRenderPos(entity, alpha);
  const frame = Math.floor((entity.ttl * 18) % 4);
  drawSprite(ctx, assets.sprites.bullet, frame, p.x, p.y, 24, 24, p.angle, 1);
}

function drawAsteroid(ctx, entity, alpha, assets) {
  const p = getRenderPos(entity, alpha);
  const frame = entity.variant % 4;
  drawSprite(ctx, assets.sprites.asteroid, frame, p.x, p.y, 64, 64, p.angle, 1);
  if (entity.homing) {
    ctx.save();
    ctx.strokeStyle = "rgb(255 157 102 / 55%)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, entity.radius + 5, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

function drawPickup(ctx, entity, alpha) {
  const p = getRenderPos(entity, alpha);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(entity.spin);
  ctx.strokeStyle = entity.pickupType === "shield" ? "#62d6ff" : "#ffcf58";
  ctx.fillStyle = "rgb(11 28 43 / 90%)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(-10, -10, 20, 20);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = entity.pickupType === "shield" ? "#bff3ff" : "#fff0ad";
  ctx.font = "bold 10px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(entity.pickupType === "shield" ? "S" : "R", 0, 0);
  ctx.restore();
}

function drawExplosion(ctx, entity) {
  ctx.save();
  for (const particle of entity.particles) {
    const t = Math.min(1, particle.age / particle.life);
    const distance = particle.speed * particle.age;
    const x = entity.pos.x + Math.cos(particle.angle) * distance;
    const y = entity.pos.y + Math.sin(particle.angle) * distance;
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = "#ffd36e";
    ctx.fillRect(x, y, particle.size, particle.size);
  }
  ctx.restore();
}

export function drawWorld(ctx, world, alpha, assets) {
  for (const entity of world) {
    if (!entity.alive) continue;
    if (entity.kind === "ship") drawShip(ctx, entity, alpha, assets);
    else if (entity.kind === "bullet") drawBullet(ctx, entity, alpha, assets);
    else if (entity.kind === "asteroid")
      drawAsteroid(ctx, entity, alpha, assets);
    else if (entity.kind === "pickup") drawPickup(ctx, entity, alpha);
    else if (entity.kind === "explosion") drawExplosion(ctx, entity);
  }
}

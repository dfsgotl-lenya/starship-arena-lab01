const TAU = Math.PI * 2;

function lerp(a, b, alpha) {
  return a + (b - a) * alpha;
}

function shortestAngleDelta(a, b) {
  let delta = (b - a + Math.PI) % TAU - Math.PI;
  if (delta < -Math.PI) delta += TAU;
  return delta;
}

function lerpAngle(a, b, alpha) {
  return a + shortestAngleDelta(a, b) * alpha;
}

export function interpolateShip(previous, current, alpha) {
  return {
    x: lerp(previous.x, current.x, alpha),
    y: lerp(previous.y, current.y, alpha),
    vx: lerp(previous.vx, current.vx, alpha),
    vy: lerp(previous.vy, current.vy, alpha),
    angle: lerpAngle(previous.angle, current.angle, alpha),
    thrust: current.thrust,
  };
}

export function drawBackground(ctx, width, height, timeSeconds, stars) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#020713");
  gradient.addColorStop(0.55, "#071425");
  gradient.addColorStop(1, "#02080f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = "#4a86ad";
  ctx.lineWidth = 1;
  const grid = 64;
  const offset = (timeSeconds * 7) % grid;
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

  ctx.save();
  for (const star of stars) {
    const twinkle = 0.55 + Math.sin(timeSeconds * star.speed + star.phase) * 0.25;
    ctx.globalAlpha = twinkle;
    ctx.fillStyle = "#d9f6ff";
    ctx.fillRect(star.x * width, star.y * height, star.size, star.size);
  }
  ctx.restore();
}

export function drawShip(ctx, ship) {
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  if (ship.thrust) {
    ctx.save();
    const flame = 10 + Math.sin(performance.now() * 0.025) * 4;
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(-18 - flame, -6);
    ctx.lineTo(-18 - flame * 0.55, 0);
    ctx.lineTo(-18 - flame, 6);
    ctx.closePath();
    ctx.fillStyle = "#ffb14e";
    ctx.fill();
    ctx.restore();
  }

  ctx.shadowBlur = 18;
  ctx.shadowColor = "#65d7ff";
  ctx.fillStyle = "#b9f1ff";
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(-12, -11);
  ctx.lineTo(-6, 0);
  ctx.lineTo(-12, 11);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#1a8bb0";
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-8, -5);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-8, 5);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

export function drawArenaFrame(ctx, width, height) {
  ctx.save();
  ctx.strokeStyle = "rgb(101 215 255 / 30%)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
  ctx.restore();
}

export function drawHud(dom, stats, ship, dpr) {
  dom.steps.textContent = stats.stepsPerSecond.toFixed(1);
  dom.frames.textContent = stats.framesPerSecond.toFixed(1);
  dom.frameTime.textContent = `${stats.frameTimeMs.toFixed(2)} ms`;
  dom.position.textContent = `${ship.x.toFixed(0)}, ${ship.y.toFixed(0)}`;
  dom.velocity.textContent = `${ship.vx.toFixed(0)}, ${ship.vy.toFixed(0)}`;
  dom.dpr.textContent = dpr.toFixed(2);
}

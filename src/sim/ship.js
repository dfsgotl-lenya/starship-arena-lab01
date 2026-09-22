export const SHIP_CONFIG = Object.freeze({
  turnSpeed: 3.4,
  thrustAcceleration: 260,
  drag: 0.992,
  maxSpeed: 420,
});

export function createShip(x, y) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    angle: 0,
    thrust: false,
  };
}

export function cloneShip(ship) {
  return { ...ship };
}

export function integrate(ship, input, dt) {
  const left = input.isDown("ArrowLeft") || input.isDown("KeyA");
  const right = input.isDown("ArrowRight") || input.isDown("KeyD");
  const thrust = input.isDown("ArrowUp") || input.isDown("KeyW");

  const turnDirection = Number(right) - Number(left);
  const angle = ship.angle + turnDirection * SHIP_CONFIG.turnSpeed * dt;

  let vx = ship.vx;
  let vy = ship.vy;

  if (thrust) {
    vx += Math.cos(angle) * SHIP_CONFIG.thrustAcceleration * dt;
    vy += Math.sin(angle) * SHIP_CONFIG.thrustAcceleration * dt;
  }

  const dragFactor = Math.pow(SHIP_CONFIG.drag, dt * 60);
  vx *= dragFactor;
  vy *= dragFactor;

  const speed = Math.hypot(vx, vy);
  if (speed > SHIP_CONFIG.maxSpeed) {
    const factor = SHIP_CONFIG.maxSpeed / speed;
    vx *= factor;
    vy *= factor;
  }

  return {
    x: ship.x + vx * dt,
    y: ship.y + vy * dt,
    vx,
    vy,
    angle,
    thrust,
  };
}

export function wrapShip(ship, width, height) {
  const margin = 24;
  return {
    ...ship,
    x: ship.x < -margin ? width + margin : ship.x > width + margin ? -margin : ship.x,
    y: ship.y < -margin ? height + margin : ship.y > height + margin ? -margin : ship.y,
  };
}

export function integrateVariable(ship, input, dt) {
  return integrate(ship, input, dt);
}

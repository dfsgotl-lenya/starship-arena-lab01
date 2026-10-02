export function cloneEntity(entity) {
  return { ...entity };
}

export function createShip(id, x, y) {
  return {
    id,
    kind: "ship",
    x,
    y,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 18,
    hp: 100,
    maxHp: 100,
    turnSpeed: 3.4,
    thrustAcceleration: 260,
    drag: 0.992,
    maxSpeed: 420,
    fireCooldown: 0,
    fireInterval: 0.12,
    alive: true,
  };
}

export function createBullet(id, ownerId, ship) {
  const muzzleX = ship.x + Math.cos(ship.angle) * (ship.radius + 11);
  const muzzleY = ship.y + Math.sin(ship.angle) * (ship.radius + 11);
  return {
    id,
    kind: "bullet",
    ownerId,
    x: muzzleX,
    y: muzzleY,
    vx: ship.vx + Math.cos(ship.angle) * 520,
    vy: ship.vy + Math.sin(ship.angle) * 520,
    angle: ship.angle,
    radius: 5,
    ttl: 1.5,
    homing: false,
    alive: true,
  };
}

export function createAsteroid(
  id,
  x,
  y,
  vx,
  vy,
  radius,
  homing = false,
  variant = 0,
) {
  return {
    id,
    kind: "asteroid",
    x,
    y,
    vx,
    vy,
    angle: 0,
    radius,
    homing,
    variant,
    alive: true,
  };
}

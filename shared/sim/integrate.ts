import type { InputState, ShipEntity } from "../types.ts";

const TAU = Math.PI * 2;
export interface IntegrateOptions {
  readonly breakDeterminism?: boolean;
}

/**
 * Ship physics shared by the server step and client prediction.
 *
 * Lab 7: the math is done on plain numbers and written back into `out`
 * (which may be `ship` itself), so a step allocates nothing. The order of
 * floating-point operations is the same as the Lab 6 Vector2 version, so the
 * results are bit-identical and client/server stay in sync.
 */
export function integrateInPlace<T extends ShipEntity>(
  ship: Readonly<T>,
  input: InputState,
  dt: number,
  out: T,
  breakDeterminism = false,
): T {
  const turn = Math.max(-1, Math.min(1, input.turn));
  let angle = ship.angle + turn * ship.turnSpeed * dt;
  if (angle > Math.PI) angle -= TAU;
  if (angle < -Math.PI) angle += TAU;

  let vx = ship.vx;
  let vy = ship.vy;
  if (input.thrust) {
    const push = ship.thrustAcceleration * dt;
    vx += Math.cos(angle) * push;
    vy += Math.sin(angle) * push;
  }
  const drag = Math.pow(ship.drag, dt * 60);
  vx *= drag;
  vy *= drag;
  if (breakDeterminism) {
    // Deliberate Lab 05 experiment: client-only randomness makes prediction diverge.
    const nudge = (Math.random() - 0.5) * 0.8;
    vx += nudge;
    vy += -nudge;
  }
  const speed = Math.hypot(vx, vy);
  if (speed > ship.maxSpeed) {
    const inverse = 1 / speed;
    vx = vx * inverse * ship.maxSpeed;
    vy = vy * inverse * ship.maxSpeed;
  }

  const x = ship.x + vx * dt;
  const y = ship.y + vy * dt;
  const cooldown = Math.max(0, ship.fireCooldown - dt);
  if (out !== ship) copyShip(out, ship);
  out.angle = angle;
  out.vx = vx;
  out.vy = vy;
  out.x = x;
  out.y = y;
  out.fireCooldown = cooldown;
  return out;
}

/** Immutable wrapper kept for callers and tests that want a fresh object. */
export function integrate<T extends ShipEntity>(
  ship: T,
  input: InputState,
  dt: number,
  { breakDeterminism = false }: IntegrateOptions = {},
): T {
  return integrateInPlace(ship, input, dt, { ...ship }, breakDeterminism);
}

/** Field-by-field copy: keeps `target`'s hidden class instead of spreading. */
export function copyShip<T extends ShipEntity>(
  target: T,
  source: Readonly<T>,
): T {
  target.id = source.id;
  target.x = source.x;
  target.y = source.y;
  target.vx = source.vx;
  target.vy = source.vy;
  target.angle = source.angle;
  target.radius = source.radius;
  target.alive = source.alive;
  target.hp = source.hp;
  target.maxHp = source.maxHp;
  target.turnSpeed = source.turnSpeed;
  target.thrustAcceleration = source.thrustAcceleration;
  target.drag = source.drag;
  target.maxSpeed = source.maxSpeed;
  target.fireCooldown = source.fireCooldown;
  target.fireInterval = source.fireInterval;
  return target;
}

/** Toroidal wrap used by both the server world and client prediction. */
export function wrapPosition(
  entity: { x: number; y: number },
  width: number,
  height: number,
): void {
  if (entity.x < 0) entity.x += width;
  if (entity.x >= width) entity.x -= width;
  if (entity.y < 0) entity.y += height;
  if (entity.y >= height) entity.y -= height;
}

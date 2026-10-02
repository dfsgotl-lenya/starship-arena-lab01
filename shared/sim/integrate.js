import { Vector2 } from "./vector.js";

const TAU = Math.PI * 2;

export function integrate(ship, input, dt, { breakDeterminism = false } = {}) {
  const turn = Math.max(-1, Math.min(1, Number(input?.turn ?? 0)));
  const thrust = Boolean(input?.thrust);
  let angle = ship.angle + turn * ship.turnSpeed * dt;
  if (angle > Math.PI) angle -= TAU;
  if (angle < -Math.PI) angle += TAU;

  let velocity = new Vector2(ship.vx, ship.vy);
  if (thrust) {
    velocity = velocity.add(
      Vector2.fromAngle(angle, ship.thrustAcceleration * dt),
    );
  }
  velocity = velocity.scale(Math.pow(ship.drag, dt * 60));
  if (breakDeterminism) {
    // Deliberate Lab 05 experiment: client-only randomness makes prediction diverge.
    const nudge = (Math.random() - 0.5) * 0.8;
    velocity = velocity.add(new Vector2(nudge, -nudge));
  }
  const speed = velocity.length();
  if (speed > ship.maxSpeed)
    velocity = velocity.normalize().scale(ship.maxSpeed);

  return {
    ...ship,
    angle,
    vx: velocity.x,
    vy: velocity.y,
    x: ship.x + velocity.x * dt,
    y: ship.y + velocity.y * dt,
    fireCooldown: Math.max(0, (ship.fireCooldown ?? 0) - dt),
  };
}

import { Vector2 } from "./vector.js";

export function createHomingBehavior({ targetKind, turnRate = 3.5, acceleration = 80, maxSpeed = 320 }) {
  return {
    targetKind,
    turnRate,
    acceleration,
    maxSpeed,
    update(owner, world, dt) {
      let best = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const candidate of world.ofKind(targetKind)) {
        if (!candidate.alive || candidate.id === owner.id) continue;
        const distance = candidate.pos.sub(owner.pos).length();
        if (distance < bestDistance) {
          best = candidate;
          bestDistance = distance;
        }
      }
      if (!best) return;

      const desired = best.pos.sub(owner.pos).normalize();
      const current = owner.vel.length() > 1e-6 ? owner.vel.normalize() : Vector2.fromAngle(owner.angle);
      const cross = current.x * desired.y - current.y * desired.x;
      const dot = Math.max(-1, Math.min(1, current.dot(desired)));
      const angle = Math.atan2(cross, dot);
      const clamped = Math.max(-turnRate * dt, Math.min(turnRate * dt, angle));
      owner.vel = owner.vel.rotate(clamped).add(desired.scale(acceleration * dt));

      const speed = owner.vel.length();
      if (speed > maxSpeed) owner.vel = owner.vel.normalize().scale(maxSpeed);
      owner.angle = Math.atan2(owner.vel.y, owner.vel.x);
    },
  };
}

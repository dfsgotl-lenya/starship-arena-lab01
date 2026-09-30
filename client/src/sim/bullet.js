import { Entity } from "./entity.js";
import { createHomingBehavior } from "./homing.js";

export class Bullet extends Entity {
  constructor(pos, vel, angle = 0, { ownerId = null, homing = false } = {}) {
    super({ pos, vel, radius: 5, kind: "bullet", angle });
    this.ttl = 2.2;
    this.ownerId = ownerId;
    this.homing = homing
      ? createHomingBehavior({
          targetKind: "asteroid",
          turnRate: 5.2,
          acceleration: 35,
          maxSpeed: 560,
        })
      : null;
  }

  update(dt, context) {
    if (this.homing) this.homing.update(this, context.world, dt);
    this.pos = this.pos.add(this.vel.scale(dt));
    this.ttl -= dt;
    if (this.ttl <= 0) this.alive = false;
    if (
      this.pos.x < -40 ||
      this.pos.x > context.width + 40 ||
      this.pos.y < -40 ||
      this.pos.y > context.height + 40
    ) {
      this.alive = false;
    }
  }
}

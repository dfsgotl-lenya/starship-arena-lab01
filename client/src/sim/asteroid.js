import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";
import { createHomingBehavior } from "./homing.js";

export class Asteroid extends Entity {
  constructor(x, y, vx, vy, radius = 24, homing = false) {
    super({
      pos: new Vector2(x, y),
      vel: new Vector2(vx, vy),
      radius,
      kind: "asteroid",
    });
    this.rotationSpeed = (Math.random() - 0.5) * 2;
    this.homing = homing
      ? createHomingBehavior({
          targetKind: "ship",
          turnRate: 1.7,
          acceleration: 18,
          maxSpeed: 90,
        })
      : null;
    this.variant = Math.floor(Math.random() * 3);
  }

  update(dt, context) {
    if (this.homing) this.homing.update(this, context.world, dt);
    this.pos = this.pos.add(this.vel.scale(dt));
    this.angle += this.rotationSpeed * dt;

    if (this.pos.x < this.radius && this.vel.x < 0)
      this.vel = new Vector2(-this.vel.x, this.vel.y);
    if (this.pos.x > context.width - this.radius && this.vel.x > 0)
      this.vel = new Vector2(-this.vel.x, this.vel.y);
    if (this.pos.y < this.radius && this.vel.y < 0)
      this.vel = new Vector2(this.vel.x, -this.vel.y);
    if (this.pos.y > context.height - this.radius && this.vel.y > 0)
      this.vel = new Vector2(this.vel.x, -this.vel.y);
  }
}

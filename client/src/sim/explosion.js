import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

export class Explosion extends Entity {
  constructor(x, y) {
    super({
      pos: new Vector2(x, y),
      vel: new Vector2(),
      radius: 2,
      kind: "explosion",
    });
    this.ttl = 0.55;
    this.particles = Array.from({ length: 18 }, () => ({
      angle: Math.random() * Math.PI * 2,
      speed: 45 + Math.random() * 170,
      size: 1 + Math.random() * 3,
      life: 0.25 + Math.random() * 0.3,
      age: 0,
    }));
  }

  update(dt) {
    this.ttl -= dt;
    for (const particle of this.particles) particle.age += dt;
    if (this.ttl <= 0) this.alive = false;
  }
}

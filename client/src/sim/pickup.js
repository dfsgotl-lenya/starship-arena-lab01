import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

export class Pickup extends Entity {
  constructor(x, y, type = "shield") {
    super({
      pos: new Vector2(x, y),
      vel: new Vector2(),
      radius: 14,
      kind: "pickup",
    });
    this.pickupType = type;
    this.spin = Math.random() * Math.PI * 2;
  }

  update(dt) {
    this.spin += dt * 1.8;
  }

  collect(ship) {
    if (this.pickupType === "shield") ship.activateShield(7);
    if (this.pickupType === "rapid") ship.activateRapidFire(7);
    this.alive = false;
  }
}

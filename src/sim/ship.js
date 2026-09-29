import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";
import { Bullet } from "./bullet.js";

export class Ship extends Entity {
  #hp = 100;

  constructor(x, y) {
    super({ pos: new Vector2(x, y), vel: new Vector2(), radius: 18, kind: "ship" });
    this.maxHp = 100;
    this.turnSpeed = 3.4;
    this.thrustAcceleration = 260;
    this.drag = 0.992;
    this.maxSpeed = 420;
    this.fireCooldown = 0;
    this.fireInterval = 0.24;
    this.shieldTime = 0;
    this.rapidFireTime = 0;
  }

  get hp() {
    return this.#hp;
  }

  get activePowerup() {
    if (this.shieldTime > 0) return `SHIELD ${this.shieldTime.toFixed(1)}s`;
    if (this.rapidFireTime > 0) return `RAPID ${this.rapidFireTime.toFixed(1)}s`;
    return "—";
  }

  update(dt, { input }) {
    const left = input.isDown("ArrowLeft") || input.isDown("KeyA");
    const right = input.isDown("ArrowRight") || input.isDown("KeyD");
    const thrust = input.isDown("ArrowUp") || input.isDown("KeyW");
    const direction = Number(right) - Number(left);

    this.angle += direction * this.turnSpeed * dt;
    if (thrust) this.vel = this.vel.add(Vector2.fromAngle(this.angle, this.thrustAcceleration * dt));

    this.vel = this.vel.scale(Math.pow(this.drag, dt * 60));
    if (this.vel.length() > this.maxSpeed) this.vel = this.vel.normalize().scale(this.maxSpeed);
    this.pos = this.pos.add(this.vel.scale(dt));
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.shieldTime = Math.max(0, this.shieldTime - dt);
    this.rapidFireTime = Math.max(0, this.rapidFireTime - dt);
    if (this.rapidFireTime === 0) this.fireInterval = 0.24;
  }

  fire(world) {
    if (!this.alive || this.fireCooldown > 0) return null;
    const muzzleOffset = Vector2.fromAngle(this.angle, this.radius + 11);
    const bulletVelocity = this.vel.add(Vector2.fromAngle(this.angle, 520));
    const bullet = new Bullet(this.pos.add(muzzleOffset), bulletVelocity, this.angle, {
      ownerId: this.id,
      homing: world.bulletHomingEnabled,
    });
    world.spawn(bullet);
    world.events.dispatchEvent(new window.CustomEvent("fired", { detail: { shipId: this.id, bullet } }));
    this.fireCooldown = this.fireInterval;
    return bullet;
  }

  damage(amount, world) {
    if (!this.alive || this.shieldTime > 0) return false;
    this.#hp = Math.max(0, this.#hp - amount);
    if (this.#hp === 0) world.destroyShip(this);
    return true;
  }

  healFull() {
    this.#hp = this.maxHp;
    this.alive = true;
    this.shieldTime = 0;
    this.rapidFireTime = 0;
  }

  activateShield(duration = 6) {
    this.shieldTime = Math.max(this.shieldTime, duration);
  }

  activateRapidFire(duration = 6) {
    this.rapidFireTime = Math.max(this.rapidFireTime, duration);
    this.fireInterval = 0.08;
  }
}

export function createShip(x, y) {
  return new Ship(x, y);
}

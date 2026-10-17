import { entityId } from "../types.ts";
import type {
  AsteroidEntity,
  BulletEntity,
  Entity,
  EntityId,
  ShipEntity,
} from "../types.ts";

export function cloneEntity<T extends Entity>(entity: T): T {
  return { ...entity };
}

export function createShip(id: EntityId, x: number, y: number): ShipEntity {
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

export type Muzzle = Pick<
  ShipEntity,
  "x" | "y" | "vx" | "vy" | "angle" | "radius"
>;

export function createBullet(
  id: EntityId,
  ownerId: EntityId,
  ship: Muzzle,
): BulletEntity {
  return initBullet(blankBullet(), id, ownerId, ship);
}

/** A bullet with every field present, so pooled bullets share one hidden class. */
export function blankBullet(): BulletEntity {
  return {
    id: entityId(0),
    kind: "bullet",
    ownerId: entityId(0),
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 5,
    ttl: 0,
    homing: false,
    alive: false,
  };
}

/** (Re)initialises a bullet in place — used with the bullet pool. */
export function initBullet<T extends BulletEntity>(
  bullet: T,
  id: EntityId,
  ownerId: EntityId,
  ship: Muzzle,
): T {
  const cos = Math.cos(ship.angle);
  const sin = Math.sin(ship.angle);
  bullet.id = id;
  bullet.ownerId = ownerId;
  bullet.x = ship.x + cos * (ship.radius + 11);
  bullet.y = ship.y + sin * (ship.radius + 11);
  bullet.vx = ship.vx + cos * 520;
  bullet.vy = ship.vy + sin * 520;
  bullet.angle = ship.angle;
  bullet.radius = 5;
  bullet.ttl = 1.5;
  bullet.homing = false;
  bullet.alive = true;
  return bullet;
}

export function createAsteroid(
  id: EntityId,
  x: number,
  y: number,
  vx: number,
  vy: number,
  radius: number,
  homing = false,
  variant = 0,
): AsteroidEntity {
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

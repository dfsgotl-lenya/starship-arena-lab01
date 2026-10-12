import type { Entity, WorldEvent } from "../types.ts";
import type { World } from "./world.ts";

function distanceSquared(a: Readonly<Entity>, b: Readonly<Entity>): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function resolveCollisions(world: World): void {
  const entities = [...world.entities.values()].filter(
    (entity) => entity.alive,
  );
  for (const bullet of entities) {
    if (bullet.kind !== "bullet") continue;
    for (const target of entities) {
      if (!bullet.alive || !target.alive) break;
      if (target.kind !== "ship" && target.kind !== "asteroid") continue;
      if (target.kind === "ship" && target.id === bullet.ownerId) continue;
      const radius = bullet.radius + target.radius;
      if (distanceSquared(bullet, target) > radius * radius) continue;

      bullet.alive = false;
      const hit: WorldEvent = {
        type: "hit",
        targetId: target.id,
        ownerId: bullet.ownerId,
      };
      if (target.kind === "asteroid") {
        target.alive = false;
        world.addScore(bullet.ownerId, 10);
        world.events.push(hit);
      } else {
        target.hp = Math.max(0, target.hp - 25);
        world.events.push(hit);
        if (target.hp === 0) {
          target.alive = false;
          world.scheduleRespawn(target.id);
          world.addScore(bullet.ownerId, 50);
          world.events.push({ type: "exploded", targetId: target.id });
        }
      }
    }
  }
}

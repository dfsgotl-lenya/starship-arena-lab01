export function findCollisionPairs(world) {
  const entities = [...world];
  const pairs = [];
  for (let i = 0; i < entities.length; i += 1) {
    const a = entities[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < entities.length; j += 1) {
      const b = entities[j];
      if (!b.alive) continue;
      const dx = a.pos.x - b.pos.x;
      const dy = a.pos.y - b.pos.y;
      const radius = a.radius + b.radius;
      if (dx * dx + dy * dy <= radius * radius) pairs.push([a, b]);
    }
  }
  return pairs;
}

export function resolveCollisions(world) {
  for (const [a, b] of findCollisionPairs(world)) {
    if (!a.alive || !b.alive) continue;

    const kinds = new Set([a.kind, b.kind]);
    if (kinds.has("bullet") && kinds.has("asteroid")) {
      const bullet = a.kind === "bullet" ? a : b;
      const asteroid = a.kind === "asteroid" ? a : b;
      bullet.alive = false;
      asteroid.alive = false;
      world.addScore(10);
      world.events.dispatchEvent(
        new window.CustomEvent("hit", {
          detail: { attacker: bullet, target: asteroid },
        }),
      );
      world.spawnExplosion(asteroid.pos.x, asteroid.pos.y);
      continue;
    }

    if (kinds.has("bullet") && kinds.has("ship")) {
      const bullet = a.kind === "bullet" ? a : b;
      const ship = a.kind === "ship" ? a : b;
      if (bullet.ownerId === ship.id) continue;
      bullet.alive = false;
      world.events.dispatchEvent(
        new window.CustomEvent("hit", {
          detail: { attacker: bullet, target: ship },
        }),
      );
      ship.damage(25, world);
      if (!ship.alive) world.spawnExplosion(ship.pos.x, ship.pos.y);
      continue;
    }

    if (kinds.has("ship") && kinds.has("asteroid")) {
      const ship = a.kind === "ship" ? a : b;
      const asteroid = a.kind === "asteroid" ? a : b;
      world.events.dispatchEvent(
        new window.CustomEvent("hit", {
          detail: { attacker: asteroid, target: ship },
        }),
      );
      if (ship.damage(18, world)) {
        asteroid.vel = asteroid.vel.scale(-0.8);
      }
      continue;
    }

    if (kinds.has("ship") && kinds.has("pickup")) {
      const ship = a.kind === "ship" ? a : b;
      const pickup = a.kind === "pickup" ? a : b;
      if (pickup.alive) {
        pickup.collect(ship);
        world.spawnExplosion(pickup.pos.x, pickup.pos.y, { sparkOnly: true });
      }
    }
  }
}

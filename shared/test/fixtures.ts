import { World } from "../sim/world.ts";
import { createShip } from "../sim/entity.ts";
import { entityId, sequenceNumber, tickNumber } from "../types.ts";
import type { InputPacket, InputState, ShipEntity, Turn } from "../types.ts";

export const IDLE: InputState = { thrust: false, turn: 0, fire: false };

export function ship(overrides: Partial<ShipEntity> = {}): ShipEntity {
  return { ...createShip(entityId(1), 100, 100), ...overrides };
}

export function packet(
  seq: number,
  thrust: boolean,
  turn: Turn,
  fire = false,
): InputPacket {
  return {
    seq: sequenceNumber(seq),
    tick: tickNumber(seq),
    thrust,
    turn,
    fire,
  };
}

/** A world with no asteroids, so tests control every entity. */
export function emptyWorld(seed = 7): World {
  return new World({ seed, arena: { asteroidCount: 0 } });
}

/** Deterministic pseudo-input script used by the determinism tests. */
export function scriptedInput(step: number): InputState {
  const turns: readonly Turn[] = [-1, 0, 1, 0];
  return {
    thrust: step % 3 !== 0,
    turn: turns[Math.floor(step / 7) % turns.length] ?? 0,
    fire: step % 5 === 0,
  };
}

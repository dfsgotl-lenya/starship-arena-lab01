import { mulberry32 } from "@starship-arena/shared/sim/prng.ts";
import { sequenceNumber, tickNumber } from "@starship-arena/shared/types.ts";
import type {
  EntityId,
  InputPacket,
  Seq,
  SnapshotEntity,
  Turn,
} from "@starship-arena/shared/types.ts";
import type { SnapshotPayload } from "./types.ts";

/**
 * A bot is driven exactly like a human: it reads the same snapshot a client
 * receives and produces the same `InputPacket` ({seq, tick, thrust, turn, fire})
 * that the WebSocket layer hands to `Match.handleInput` after decoding.
 * It never touches the world directly.
 */
export class BotBrain {
  readonly #random: () => number;
  #seq: Seq = sequenceNumber(0);
  #wanderTurn: Turn = 0;
  #wanderTicks = 0;

  constructor(seed: number) {
    this.#random = mulberry32(seed);
  }

  /** Decide the next input from the latest snapshot this bot has seen. */
  decide(snapshot: SnapshotPayload, shipId: EntityId | undefined): InputPacket {
    this.#seq = sequenceNumber((Number(this.#seq) + 1) >>> 0);
    let self: SnapshotEntity | undefined;
    let target: SnapshotEntity | undefined;
    let best = Infinity;
    for (const entity of snapshot.entities)
      if (entity.id === shipId) self = entity;
    if (self) {
      for (const entity of snapshot.entities) {
        if (entity.id === self.id) continue;
        if (entity.kind !== "ship" && entity.kind !== "asteroid") continue;
        const dx = entity.x - self.x;
        const dy = entity.y - self.y;
        const d = dx * dx + dy * dy;
        if (d < best) {
          best = d;
          target = entity;
        }
      }
    }
    let turn: Turn = 0;
    let fire = false;
    let thrust = this.#random() < 0.55;
    if (self && target) {
      const desired = Math.atan2(target.y - self.y, target.x - self.x);
      let delta = desired - self.angle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      turn = Math.abs(delta) < 0.08 ? 0 : delta > 0 ? 1 : -1;
      fire = Math.abs(delta) < 0.35 && this.#random() < 0.6;
      if (best < 120 * 120) thrust = false;
    } else {
      if (this.#wanderTicks-- <= 0) {
        const roll = this.#random();
        this.#wanderTurn = roll < 0.33 ? -1 : roll < 0.66 ? 0 : 1;
        this.#wanderTicks = 10 + Math.floor(this.#random() * 30);
      }
      turn = this.#wanderTurn;
    }
    return {
      seq: this.#seq,
      tick: tickNumber(Number(snapshot.tick)),
      thrust,
      turn,
      fire,
    };
  }
}

import { vi } from "vitest";
import { GameConnection } from "../src/connection.ts";
import { NetworkGame } from "../src/netcode/game-client.ts";
import { Bus } from "../src/events.ts";
import type { GameEvents } from "../src/events.ts";
import type { InputController } from "../src/types.ts";
import type { InputPacket } from "@starship-arena/shared/types.ts";
import {
  decodeSnapshotInto,
  encodeSnapshot,
} from "@starship-arena/shared/codec/binary.ts";
import { sequenceNumber } from "@starship-arena/shared/types.ts";
import type { World } from "@starship-arena/shared/sim/world.ts";

export function fakeInput(down: Set<string> = new Set()): InputController {
  return {
    isDown: (code) => down.has(code),
    justPressed: () => false,
    endFrame: () => undefined,
    destroy: () => undefined,
  };
}

export function makeGame(keys = new Set<string>()) {
  const connection = new GameConnection("ws://localhost/ws");
  const sent: InputPacket[] = [];
  vi.spyOn(connection, "sendInput").mockImplementation((packet) => {
    sent.push({ ...packet });
    return true;
  });
  let now = 0;
  const events = new Bus<GameEvents>();
  const game = new NetworkGame({
    connection,
    width: 960,
    height: 600,
    input: fakeInput(keys),
    events,
    now: () => now,
  });
  return {
    connection,
    game,
    sent,
    events,
    keys,
    advance(ms: number) {
      now += ms;
    },
    get now() {
      return now;
    },
  };
}

/** Server → client: encode the world like the server does and feed it to the game. */
export function deliver(
  game: NetworkGame,
  world: World,
  ack = 0,
  score = 0,
): void {
  const frame = encodeSnapshot(world.snapshot(), sequenceNumber(ack), score);
  const slot = game.slot();
  decodeSnapshotInto(frame, slot);
  game.commit(slot);
}

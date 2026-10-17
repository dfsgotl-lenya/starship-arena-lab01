import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ServerConfig } from "../src/config.ts";
import type {
  RoomPlayer,
  SnapshotFrame,
  SnapshotPayload,
} from "../src/types.ts";
import type { WebSocket } from "ws";

export function testConfig(
  overrides: Partial<ServerConfig> = {},
): ServerConfig {
  return {
    port: 0,
    host: "127.0.0.1",
    logDir: mkdtempSync(path.join(tmpdir(), "starship-test-")),
    maxRooms: 12,
    roomCapacity: 8,
    maxPayload: 4096,
    messageRate: 60,
    heartbeatMs: 60_000,
    slowClientBytes: 65_536,
    tickRate: 30,
    netLatencyMs: 0,
    netJitterMs: 0,
    netDropPct: 0,
    bots: 0,
    botRoom: "alpha",
    broadphase: "hash",
    ...overrides,
  };
}

export interface RecordingPlayer extends RoomPlayer {
  readonly received: Array<{
    payload: SnapshotPayload;
    frame: SnapshotFrame | undefined;
  }>;
}

/** A match player whose transport just records snapshots. */
export function recordingPlayer(id: string): RecordingPlayer {
  const received: RecordingPlayer["received"] = [];
  const socket = {
    readyState: 3,
    send: () => undefined,
  } as unknown as WebSocket;
  return {
    id,
    name: id,
    socket,
    received,
    net: {
      protocol: "binary",
      sendSnapshot: (payload, _config, frame) => {
        received.push({ payload, frame });
      },
    },
  };
}

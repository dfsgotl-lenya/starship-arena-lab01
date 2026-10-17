import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig } from "../src/config.ts";
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
    ...loadConfig({ NODE_ENV: "test" }),
    port: 0,
    logDir: mkdtempSync(path.join(tmpdir(), "starship-test-")),
    heartbeatMs: 60_000,
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

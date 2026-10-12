import type { WebSocket } from "ws";
import type {
  EntityId,
  InputPacket,
  Snapshot,
} from "@starship-arena/shared/types.ts";
import type { ServerConfig } from "./config.ts";
import type { TokenBucket } from "./rate-limit.ts";
import type { Room } from "./rooms.ts";

export interface SnapshotPayload extends Snapshot {
  readonly lastProcessedSeq: InputPacket["seq"];
  readonly score: number;
  readonly serverTime: number;
}

export interface PlayerNetwork {
  protocol?: "json" | "binary";
  sendSnapshot?: (snapshot: SnapshotPayload, config: ServerConfig) => void;
}

export interface RoomPlayer {
  readonly id: string;
  readonly name: string;
  readonly socket: WebSocket;
  shipId?: EntityId;
  net: PlayerNetwork;
}

export interface NetSettings {
  readonly latency: number;
  readonly jitter: number;
  readonly drop: number;
  readonly protocol: "json" | "binary";
}

export interface SocketAppState {
  readonly id: string;
  player: RoomPlayer | null;
  room: Room | null;
  isAlive: boolean;
  missedPongs: number;
  readonly joinTimer: NodeJS.Timeout;
  readonly bucket: TokenBucket;
  readonly net: NetSettings;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

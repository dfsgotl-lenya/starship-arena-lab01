import type {
  EntityId,
  EntityKind,
  InputPacket,
  NetworkSnapshot,
} from "@starship-arena/shared/types.ts";

export interface InputController {
  isDown(code: string): boolean;
  justPressed(code: string): boolean;
  endFrame(): void;
  destroy(): void;
}

export interface LoopStats {
  stepsPerSecond: number;
  framesPerSecond: number;
  frameTimeMs: number;
  totalSteps: number;
  totalFrames: number;
}
export interface VariableLoopStats {
  stepsPerSecond: number;
  framesPerSecond: number;
  frameTimeMs: number;
  totalFrames: number;
}
export interface LoopOptions {
  readonly step?: number;
  readonly simulate: (dt: number) => void;
  readonly render: (alpha: number, stats: LoopStats) => void;
}
export interface VariableLoopOptions {
  readonly simulate: (dt: number) => void;
  readonly render: (alpha: number, stats: VariableLoopStats) => void;
}

export interface ClientEntity {
  readonly id: EntityId;
  readonly kind: EntityKind;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly radius?: number;
  readonly alive?: boolean;
  readonly ownerId?: EntityId;
  readonly hp?: number;
  readonly maxHp?: number;
  readonly ttl?: number;
  readonly homing?: boolean;
  readonly variant?: number;
  readonly local?: boolean;
  readonly prevX?: number;
  readonly prevY?: number;
  readonly prevAngle?: number;
  readonly turnSpeed?: number;
  readonly thrustAcceleration?: number;
  readonly drag?: number;
  readonly maxSpeed?: number;
  readonly fireCooldown?: number;
  readonly fireInterval?: number;
  readonly predictedAge?: number;
}
export interface RenderWorld {
  readonly entities: readonly ClientEntity[];
  readonly score?: number;
  readonly roomName?: string;
}
export interface SpriteSheet {
  readonly image: CanvasImageSource;
  readonly frames?: number;
  readonly frameWidth: number;
  readonly frameHeight: number;
}
export interface Assets {
  readonly sprites: Readonly<Record<string, SpriteSheet>>;
  readonly sounds?: Readonly<Record<string, AudioBuffer>>;
}
export interface InputControl {
  readonly seq: InputPacket["seq"];
  readonly tick: InputPacket["tick"];
  readonly thrust: boolean;
  readonly turn: -1 | 0 | 1;
  readonly fire: boolean;
}
export interface JoinedDetails {
  readonly playerId: string;
  readonly shipId: EntityId;
}
export interface LobbyRoom {
  readonly id: string;
  readonly name: string;
  readonly players: number;
  readonly capacity: number;
  readonly arena: { readonly asteroidCount?: number };
}
export interface RoomListResponse {
  readonly rooms: readonly LobbyRoom[];
}

export type SnapshotForClient = NetworkSnapshot;

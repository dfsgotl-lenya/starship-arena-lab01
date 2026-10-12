import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import type { ArenaConfig } from "@starship-arena/shared/types.ts";
import { MatchLog } from "./log/matchlog.ts";
import { Match } from "./match.ts";
import type { ServerConfig } from "./config.ts";
import type { RoomPlayer } from "./types.ts";

export type RoomLogEvent =
  | {
      readonly t: number;
      readonly type: "join";
      readonly room: string;
      readonly player: { readonly id: string; readonly name: string };
    }
  | {
      readonly t: number;
      readonly type: "leave";
      readonly room: string;
      readonly player: { readonly id: string; readonly name: string };
    }
  | {
      readonly t: number;
      readonly type: "chat";
      readonly room: string;
      readonly player: { readonly id: string; readonly name: string };
      readonly text: string;
    };
type RoomEvents = {
  error: [error: Error];
  empty: [];
  closed: [];
  join: [
    payload: {
      readonly player: { readonly id: string; readonly name: string };
    },
  ];
  leave: [
    payload: {
      readonly player: { readonly id: string; readonly name: string };
    },
  ];
  chat: [
    payload: {
      readonly player: { readonly id: string; readonly name: string };
      readonly text: string;
    },
  ];
  event: [event: RoomLogEvent];
};
type RoomManagerEvents = { error: [error: Error] };

export interface CreateRoomInput {
  readonly id?: string;
  readonly name: string;
  readonly capacity?: number;
  readonly arena?: ArenaConfig;
}
export interface RoomInfo {
  readonly id: string;
  readonly name: string;
  readonly players: number;
  readonly capacity: number;
  readonly arena: ArenaConfig;
  readonly replayId: string | undefined;
}

export class Room extends EventEmitter<RoomEvents> {
  readonly #players = new Map<string, RoomPlayer>();
  readonly #log: MatchLog;
  #closed = false;
  readonly id: string;
  readonly name: string;
  readonly capacity: number;
  readonly arena: ArenaConfig;
  readonly match: Match;

  constructor(
    {
      id,
      name,
      capacity,
      arena = {},
    }: {
      readonly id: string;
      readonly name: string;
      readonly capacity: number;
      readonly arena: ArenaConfig;
    },
    config: ServerConfig,
  ) {
    super();
    this.id = id;
    this.name = name;
    this.capacity = capacity;
    this.arena = { ...arena };
    this.match = new Match(this, config);
    this.#log = new MatchLog(this, config.logDir);
    this.#log
      .start()
      .catch((error: unknown) =>
        this.emit(
          "error",
          error instanceof Error ? error : new Error(String(error)),
        ),
      );
    this.on("error", (error) => console.error(`[room:${this.id}]`, error));
  }

  get players(): ReadonlyMap<string, RoomPlayer> {
    return new Map(this.#players);
  }
  get playerCount(): number {
    return this.#players.size;
  }
  get replayId(): string | undefined {
    return this.#log.filePath.split(/[\\/]/).pop();
  }

  join(player: RoomPlayer): void {
    if (this.#players.size >= this.capacity) throw new Error("room is full");
    this.#players.set(player.id, player);
    this.match.addPlayer(player);
    this.#emitEvent("join", { player: { id: player.id, name: player.name } });
  }

  leave(playerId: string): RoomPlayer | null {
    const player = this.#players.get(playerId);
    if (!player) return null;
    this.#players.delete(playerId);
    this.match.removePlayer(playerId);
    this.#emitEvent("leave", { player: { id: player.id, name: player.name } });
    if (this.#players.size === 0) this.emit("empty");
    return player;
  }

  chat(player: RoomPlayer, text: string): void {
    this.#emitEvent("chat", {
      player: { id: player.id, name: player.name },
      text,
    });
  }

  broadcast(
    message: unknown,
    send: (socket: WebSocket, payload: unknown) => void,
  ): void {
    for (const player of this.#players.values()) send(player.socket, message);
  }

  roster(): Array<{ id: string; name: string }> {
    return [...this.#players.values()].map((player) => ({
      id: player.id,
      name: player.name,
    }));
  }

  async close(): Promise<void> {
    if (!this.#closed) {
      this.#closed = true;
      this.match.stop();
      this.emit("closed");
    }
    await this.#log.close();
    this.removeAllListeners();
  }

  #emitEvent(
    type: "join" | "leave" | "chat",
    payload: {
      readonly player: { readonly id: string; readonly name: string };
      readonly text?: string;
    },
  ): void {
    const event: RoomLogEvent =
      type === "chat"
        ? {
            t: Date.now(),
            type,
            room: this.id,
            player: payload.player,
            text: payload.text ?? "",
          }
        : { t: Date.now(), type, room: this.id, player: payload.player };
    if (type === "join") this.emit("join", { player: payload.player });
    else if (type === "leave") this.emit("leave", { player: payload.player });
    else
      this.emit("chat", { player: payload.player, text: payload.text ?? "" });
    this.emit("event", event);
  }
}

export class RoomManager extends EventEmitter<RoomManagerEvents> {
  readonly #rooms = new Map<string, Room>();
  readonly #config: ServerConfig;

  constructor(config: ServerConfig) {
    super();
    this.#config = config;
    this.#seedDefaults();
    this.on("error", (error) => console.error("[room-manager]", error));
  }

  list(): RoomInfo[] {
    return [...this.#rooms.values()].map((room) => ({
      id: room.id,
      name: room.name,
      players: room.playerCount,
      capacity: room.capacity,
      arena: room.arena,
      replayId: room.replayId,
    }));
  }

  get(id: string): Room | undefined {
    return this.#rooms.get(id);
  }
  stats(): Array<{
    room: string;
    tickRate: number;
    tickCount: number;
    tickDurationMs: number;
    tickJitterMs: number;
    players: number;
    seed: number;
  }> {
    return [...this.#rooms.values()].map((room) => ({
      room: room.id,
      ...room.match.stats,
    }));
  }

  create({
    id = randomUUID(),
    name,
    capacity = this.#config.roomCapacity,
    arena = {},
  }: CreateRoomInput): Room {
    if (this.#rooms.size >= this.#config.maxRooms)
      throw new Error("server room limit reached");
    if (this.#rooms.has(id)) throw new Error("room already exists");
    const room = new Room({ id, name, capacity, arena }, this.#config);
    room.on("empty", () => {
      this.#rooms.delete(room.id);
      void room.close();
    });
    room.on("error", (error) => this.emit("error", error));
    this.#rooms.set(room.id, room);
    return room;
  }

  async closeAll(): Promise<void> {
    const rooms = [...this.#rooms.values()];
    this.#rooms.clear();
    await Promise.all(rooms.map((room) => room.close()));
  }

  #seedDefaults(): void {
    const defaults: CreateRoomInput[] = [
      {
        id: "alpha",
        name: "Alpha Dogfight",
        capacity: 8,
        arena: {
          asteroidCount: 8,
          homingEvery: 3,
          asteroidSpeedMin: 30,
          asteroidSpeedMax: 80,
        },
      },
      {
        id: "nebula",
        name: "Nebula Run",
        capacity: 8,
        arena: {
          asteroidCount: 11,
          homingEvery: 4,
          asteroidSpeedMin: 45,
          asteroidSpeedMax: 95,
        },
      },
      {
        id: "rookie",
        name: "Rookie Ring",
        capacity: 4,
        arena: {
          asteroidCount: 5,
          homingEvery: 5,
          asteroidSpeedMin: 20,
          asteroidSpeedMax: 55,
        },
      },
    ];
    for (const room of defaults) this.create(room);
  }
}

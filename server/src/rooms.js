import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { MatchLog } from "./log/matchlog.js";
import { Match } from "./match.js";
import path from "node:path";

export class Room extends EventEmitter {
  #players = new Map();
  #log;
  #closed = false;
  constructor({ id, name, capacity, arena }, config) {
    super();
    this.id = id;
    this.name = name;
    this.capacity = capacity;
    this.arena = { ...arena };
    this.match = new Match(this, config);
    this.#log = new MatchLog(this, config.logDir);
    this.#log.start().catch((error) => this.emit("error", error));
    this.on("error", (error) => console.error(`[room:${this.id}]`, error));
  }

  get players() {
    return new Map(this.#players);
  }
  get playerCount() {
    return this.#players.size;
  }
  get replayId() {
    return path.basename(this.#log.filePath);
  }

  join(player) {
    if (this.#players.size >= this.capacity) throw new Error("room is full");
    this.#players.set(player.id, player);
    this.match.addPlayer(player);
    this.#emitEvent("join", { player: { id: player.id, name: player.name } });
  }

  leave(playerId) {
    const player = this.#players.get(playerId);
    if (!player) return null;
    this.#players.delete(playerId);
    this.match.removePlayer(playerId);
    this.#emitEvent("leave", { player: { id: player.id, name: player.name } });
    if (this.#players.size === 0) this.emit("empty");
    return player;
  }

  chat(player, text) {
    this.#emitEvent("chat", {
      player: { id: player.id, name: player.name },
      text,
    });
  }

  broadcast(message, send) {
    for (const player of this.#players.values()) send(player.socket, message);
  }

  roster() {
    return [...this.#players.values()].map((player) => ({
      id: player.id,
      name: player.name,
    }));
  }

  async close() {
    if (!this.#closed) {
      this.#closed = true;
      this.match.stop();
      this.emit("closed");
    }
    await this.#log.close();
    this.removeAllListeners();
  }

  #emitEvent(type, payload) {
    const event = { t: Date.now(), type, room: this.id, ...payload };
    this.emit(type, payload);
    this.emit("event", event);
  }
}

export class RoomManager extends EventEmitter {
  #rooms = new Map();
  #config;
  constructor(config) {
    super();
    this.#config = config;
    this.#seedDefaults();
    this.on("error", (error) => console.error("[room-manager]", error));
  }

  list() {
    return [...this.#rooms.values()].map((room) => ({
      id: room.id,
      name: room.name,
      players: room.playerCount,
      capacity: room.capacity,
      arena: room.arena,
      replayId: room.replayId,
    }));
  }

  get(id) {
    return this.#rooms.get(id);
  }
  stats() {
    return [...this.#rooms.values()].map((room) => ({
      room: room.id,
      ...room.match.stats,
    }));
  }

  create({
    id = randomUUID(),
    name,
    capacity = this.#config.roomCapacity,
    arena,
  }) {
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

  async closeAll() {
    const rooms = [...this.#rooms.values()];
    this.#rooms.clear();
    await Promise.all(rooms.map((room) => room.close()));
  }

  #seedDefaults() {
    const defaults = [
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

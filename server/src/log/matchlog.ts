import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import type { TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import type { Room } from "../rooms.ts";
import type { RoomLogEvent } from "../rooms.ts";

class EventNdjsonTransform extends Transform {
  constructor() {
    super({ writableObjectMode: true });
  }
  override _transform(
    event: RoomLogEvent,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    callback(null, `${JSON.stringify(event)}\n`);
  }
}

class RoomEventReadable extends Readable {
  readonly #room: Room;
  readonly #onEvent: (event: RoomLogEvent) => void;
  readonly #onClose: () => void;

  constructor(room: Room) {
    super({ objectMode: true });
    this.#room = room;
    this.#onEvent = (event) => {
      this.push(event);
    };
    this.#onClose = () => {
      this.push(null);
    };
    room.on("event", this.#onEvent);
    room.once("empty", this.#onClose);
    room.once("closed", this.#onClose);
  }

  override _read(): void {}

  override _destroy(
    error: Error | null,
    callback: (error?: Error | null) => void,
  ): void {
    this.#room.off("event", this.#onEvent);
    this.#room.off("empty", this.#onClose);
    this.#room.off("closed", this.#onClose);
    callback(error);
  }
}

export class MatchLog {
  readonly #room: Room;
  readonly #filePath: string;
  #streamPromise: Promise<void> | null;

  constructor(room: Room, logDir: string) {
    this.#room = room;
    this.#filePath = path.join(logDir, `${room.id}-${Date.now()}.ndjson`);
    this.#streamPromise = null;
  }

  start(): Promise<void> {
    const source = new RoomEventReadable(this.#room);
    this.#streamPromise = pipeline(
      source,
      new EventNdjsonTransform(),
      createWriteStream(this.#filePath),
    );
    return this.#streamPromise;
  }

  get filePath(): string {
    return this.#filePath;
  }

  async close(): Promise<void> {
    if (!this.#streamPromise) return;
    try {
      await this.#streamPromise;
    } catch (error: unknown) {
      this.#room.emit(
        "error",
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}

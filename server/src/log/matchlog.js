import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

class EventNdjsonTransform extends Transform {
  constructor() {
    super({ objectMode: true });
  }

  _transform(event, _encoding, callback) {
    callback(null, `${JSON.stringify(event)}\n`);
  }
}

class RoomEventReadable extends Readable {
  #room;
  #onEvent;
  #onClose;

  constructor(room) {
    super({ objectMode: true });
    this.#room = room;
    this.#onEvent = (event) => this.push(event);
    this.#onClose = () => this.push(null);
    room.on("event", this.#onEvent);
    room.once("empty", this.#onClose);
    room.once("closed", this.#onClose);
  }

  _read() {}

  _destroy(error, callback) {
    this.#room.off("event", this.#onEvent);
    this.#room.off("empty", this.#onClose);
    this.#room.off("closed", this.#onClose);
    callback(error);
  }
}

export class MatchLog {
  #room;
  #filePath;
  #streamPromise;

  constructor(room, logDir) {
    this.#room = room;
    this.#filePath = path.join(logDir, `${room.id}-${Date.now()}.ndjson`);
    this.#streamPromise = null;
  }

  start() {
    const source = new RoomEventReadable(this.#room);
    this.#streamPromise = pipeline(
      source,
      new EventNdjsonTransform(),
      createWriteStream(this.#filePath),
    );
    return this.#streamPromise;
  }

  get filePath() {
    return this.#filePath;
  }

  async close() {
    if (!this.#streamPromise) return;
    try {
      await this.#streamPromise;
    } catch (error) {
      this.#room.emit("error", error);
    }
  }
}

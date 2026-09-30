import { EventEmitter } from "node:events";
const emitter = new EventEmitter();
emitter.on("error", (error) => console.log("handled error:", error.message));
emitter.emit("error", new Error("boom"));

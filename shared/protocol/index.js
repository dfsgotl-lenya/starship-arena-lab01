export const PROTOCOL_VERSION = 1;
export const MESSAGE = Object.freeze({
  INPUT: "input",
  SNAPSHOT: "snapshot",
  JOINED: "joined",
});
export function validateInput(input) {
  if (!Number.isInteger(input?.seq) || input.seq < 0)
    throw new Error("invalid input seq");
  if (!Number.isInteger(input?.tick) || input.tick < 0)
    throw new Error("invalid input tick");
  if (typeof input.thrust !== "boolean" || typeof input.fire !== "boolean")
    throw new Error("invalid input flags");
  if (![-1, 0, 1].includes(input.turn)) throw new Error("invalid turn");
  return input;
}

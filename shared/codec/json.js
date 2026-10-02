export function encodeJson(value) {
  return JSON.stringify(value);
}
export function decodeJson(value) {
  return typeof value === "string"
    ? JSON.parse(value)
    : JSON.parse(new globalThis.TextDecoder().decode(value));
}

export function encodeJson(value: unknown): string {
  return JSON.stringify(value);
}

/** JSON.parse returns untrusted data; callers must validate the unknown value with a schema. */
export function decodeJson(
  value: string | ArrayBuffer | ArrayBufferView,
): unknown {
  const text =
    typeof value === "string"
      ? value
      : new TextDecoder().decode(value instanceof ArrayBuffer ? value : value);
  const parsed: unknown = JSON.parse(text);
  return parsed;
}

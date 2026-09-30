export const VERSION = 0;
export const MAX_CHAT_LENGTH = 200;

function stringInRange(value, min, max) {
  return (
    typeof value === "string" &&
    value.trim().length >= min &&
    value.length <= max
  );
}

export function parseMessage(raw, maxBytes) {
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    const error = new Error("message too large");
    error.code = "MESSAGE_TOO_LARGE";
    throw error;
  }
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    const error = new Error("invalid JSON");
    error.code = "BAD_JSON";
    throw error;
  }
  validateMessage(message);
  return message;
}

export function validateMessage(message) {
  if (
    !message ||
    typeof message !== "object" ||
    message.v !== VERSION ||
    typeof message.type !== "string"
  ) {
    throw new Error("invalid message envelope");
  }

  if (message.type === "join") {
    if (
      !stringInRange(message.room, 1, 64) ||
      !stringInRange(message.name, 1, 18)
    )
      throw new Error("invalid join shape");
    return message;
  }

  if (message.type === "chat") {
    if (!stringInRange(message.text, 1, MAX_CHAT_LENGTH))
      throw new Error("invalid chat shape");
    return message;
  }

  if (message.type === "leave") return message;
  throw new Error(`unknown message type: ${message.type}`);
}

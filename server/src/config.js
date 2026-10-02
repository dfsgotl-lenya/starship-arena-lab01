function positiveInt(name, fallback, min = 1, max = 1_000_000) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function stringValue(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (!value || typeof value !== "string")
    throw new Error(`${name} must be a non-empty string`);
  return value;
}

export function loadConfig() {
  return Object.freeze({
    port: positiveInt("PORT", 3001, 1, 65535),
    host: stringValue("HOST", "127.0.0.1"),
    logDir: stringValue("LOG_DIR", "./logs"),
    maxRooms: positiveInt("MAX_ROOMS", 12, 1, 100),
    roomCapacity: positiveInt("ROOM_CAPACITY", 8, 1, 64),
    maxPayload: positiveInt("MAX_PAYLOAD", 4096, 256, 1_000_000),
    messageRate: positiveInt("MESSAGE_RATE", 8, 1, 1000),
    heartbeatMs: positiveInt("HEARTBEAT_MS", 15000, 1000, 120000),
    slowClientBytes: positiveInt("SLOW_CLIENT_BYTES", 65536, 1024, 10_000_000),
    tickRate: positiveInt("TICK_RATE", 30, 10, 120),
    netLatencyMs: positiveInt("NET_LATENCY_MS", 0, 0, 5000),
    netJitterMs: positiveInt("NET_JITTER_MS", 0, 0, 5000),
    netDropPct: positiveInt("NET_DROP_PCT", 0, 0, 100),
  });
}

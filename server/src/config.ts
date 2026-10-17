import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", "yes", "no"])
  .transform((value) => value === "true" || value === "1" || value === "yes");

/**
 * Every value that differs between a laptop and production comes from the
 * environment and is validated here at startup (fail fast, Twelve-Factor III).
 */
const EnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().min(0).max(65_535).default(3001),
  HOST: z.string().min(1).default("127.0.0.1"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  LOG_DIR: z.string().min(1).default("./logs"),
  /** Comma-separated list of extra browser origins allowed to open a WebSocket. */
  ALLOWED_ORIGINS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim().replace(/\/$/, ""))
        .filter(Boolean),
    )
    .pipe(z.array(z.string().url())),
  /** Non-browser clients (bots, load test) send no Origin header. */
  ALLOW_MISSING_ORIGIN: bool.default("true"),
  /** Behind a platform proxy (Render, Fly) the client IP is in X-Forwarded-For. */
  TRUST_PROXY: bool.default("false"),
  MAX_CONNECTIONS_PER_IP: z.coerce.number().int().min(1).max(10_000).default(8),
  MAX_ROOMS: z.coerce.number().int().min(1).max(1000).default(12),
  MAX_PLAYERS_PER_ROOM: z.coerce.number().int().min(1).max(1024).optional(),
  /** Lab 4–7 name of MAX_PLAYERS_PER_ROOM, still accepted. */
  ROOM_CAPACITY: z.coerce.number().int().min(1).max(1024).default(8),
  MAX_PAYLOAD: z.coerce.number().int().min(256).max(1_000_000).default(4096),
  MESSAGE_RATE: z.coerce.number().int().min(1).max(1000).default(60),
  HEARTBEAT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
  JOIN_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(5000),
  SLOW_CLIENT_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(10_000_000)
    .default(65_536),
  SHUTDOWN_GRACE_MS: z.coerce.number().int().min(500).max(30_000).default(8000),
  TICK_RATE: z.coerce.number().int().min(10).max(120).default(30),
  NET_LATENCY_MS: z.coerce.number().int().min(0).max(5000).default(0),
  NET_JITTER_MS: z.coerce.number().int().min(0).max(5000).default(0),
  NET_DROP_PCT: z.coerce.number().int().min(0).max(100).default(0),
  BOTS: z.coerce.number().int().min(0).max(128).default(0),
  BOT_ROOM: z.string().min(1).default("alpha"),
  BROADPHASE: z.enum(["hash", "naive"]).default("hash"),
  /** Build stamp, baked into the image by CI (`--build-arg GIT_SHA=…`). */
  GIT_SHA: z.string().default("dev"),
  DEBUG_CRASH_ENDPOINT: bool.default("false"),
  APP_VERSION: z.string().default("0.0.0-dev"),
});

export type ServerConfig = {
  readonly nodeEnv: "development" | "production" | "test";
  readonly port: number;
  readonly host: string;
  readonly logLevel: string;
  readonly logDir: string;
  readonly allowedOrigins: readonly string[];
  readonly allowMissingOrigin: boolean;
  readonly trustProxy: boolean;
  readonly maxConnectionsPerIp: number;
  readonly maxRooms: number;
  readonly roomCapacity: number;
  readonly maxPayload: number;
  readonly messageRate: number;
  readonly heartbeatMs: number;
  readonly joinTimeoutMs: number;
  readonly slowClientBytes: number;
  readonly shutdownGraceMs: number;
  readonly tickRate: number;
  readonly netLatencyMs: number;
  readonly netJitterMs: number;
  readonly netDropPct: number;
  readonly bots: number;
  readonly botRoom: string;
  readonly broadphase: "hash" | "naive";
  readonly gitSha: string;
  readonly version: string;
  readonly debugCrashEndpoint: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const values = EnvironmentSchema.parse(env);
  return Object.freeze({
    nodeEnv: values.NODE_ENV,
    port: values.PORT,
    host: values.HOST,
    logLevel: values.LOG_LEVEL,
    logDir: values.LOG_DIR,
    allowedOrigins: Object.freeze([...values.ALLOWED_ORIGINS]),
    allowMissingOrigin: values.ALLOW_MISSING_ORIGIN,
    trustProxy: values.TRUST_PROXY,
    maxConnectionsPerIp: values.MAX_CONNECTIONS_PER_IP,
    maxRooms: values.MAX_ROOMS,
    roomCapacity: values.MAX_PLAYERS_PER_ROOM ?? values.ROOM_CAPACITY,
    maxPayload: values.MAX_PAYLOAD,
    messageRate: values.MESSAGE_RATE,
    heartbeatMs: values.HEARTBEAT_MS,
    joinTimeoutMs: values.JOIN_TIMEOUT_MS,
    slowClientBytes: values.SLOW_CLIENT_BYTES,
    shutdownGraceMs: values.SHUTDOWN_GRACE_MS,
    tickRate: values.TICK_RATE,
    netLatencyMs: values.NET_LATENCY_MS,
    netJitterMs: values.NET_JITTER_MS,
    netDropPct: values.NET_DROP_PCT,
    bots: values.BOTS,
    botRoom: values.BOT_ROOM,
    broadphase: values.BROADPHASE,
    gitSha: values.GIT_SHA,
    version: values.APP_VERSION,
    debugCrashEndpoint: values.DEBUG_CRASH_ENDPOINT,
  } satisfies ServerConfig);
}

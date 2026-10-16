import { z } from "zod";

const EnvironmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  HOST: z.string().min(1).default("127.0.0.1"),
  LOG_DIR: z.string().min(1).default("./logs"),
  MAX_ROOMS: z.coerce.number().int().min(1).max(100).default(12),
  ROOM_CAPACITY: z.coerce.number().int().min(1).max(256).default(8),
  MAX_PAYLOAD: z.coerce.number().int().min(256).max(1_000_000).default(4096),
  MESSAGE_RATE: z.coerce.number().int().min(1).max(1000).default(8),
  HEARTBEAT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
  SLOW_CLIENT_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(10_000_000)
    .default(65_536),
  TICK_RATE: z.coerce.number().int().min(10).max(120).default(30),
  NET_LATENCY_MS: z.coerce.number().int().min(0).max(5000).default(0),
  NET_JITTER_MS: z.coerce.number().int().min(0).max(5000).default(0),
  NET_DROP_PCT: z.coerce.number().int().min(0).max(100).default(0),
  BOTS: z.coerce.number().int().min(0).max(128).default(0),
  BOT_ROOM: z.string().min(1).default("alpha"),
});

export type ServerConfig = {
  readonly port: number;
  readonly host: string;
  readonly logDir: string;
  readonly maxRooms: number;
  readonly roomCapacity: number;
  readonly maxPayload: number;
  readonly messageRate: number;
  readonly heartbeatMs: number;
  readonly slowClientBytes: number;
  readonly tickRate: number;
  readonly netLatencyMs: number;
  readonly netJitterMs: number;
  readonly netDropPct: number;
  readonly bots: number;
  readonly botRoom: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const values = EnvironmentSchema.parse(env);
  return Object.freeze({
    port: values.PORT,
    host: values.HOST,
    logDir: values.LOG_DIR,
    maxRooms: values.MAX_ROOMS,
    roomCapacity: values.ROOM_CAPACITY,
    maxPayload: values.MAX_PAYLOAD,
    messageRate: values.MESSAGE_RATE,
    heartbeatMs: values.HEARTBEAT_MS,
    slowClientBytes: values.SLOW_CLIENT_BYTES,
    tickRate: values.TICK_RATE,
    netLatencyMs: values.NET_LATENCY_MS,
    netJitterMs: values.NET_JITTER_MS,
    netDropPct: values.NET_DROP_PCT,
    bots: values.BOTS,
    botRoom: values.BOT_ROOM,
  } satisfies ServerConfig);
}

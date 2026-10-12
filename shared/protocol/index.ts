import { z } from "zod";
import { entityId, sequenceNumber, tickNumber } from "../types.ts";
import type {
  EntityId,
  InputPacket,
  NetworkSnapshot,
  Seq,
  Snapshot,
  SnapshotEntity,
  Tick,
} from "../types.ts";

export const PROTOCOL_VERSION = 1;
export const MESSAGE: Readonly<{
  INPUT: "input";
  SNAPSHOT: "snapshot";
  JOINED: "joined";
}> = Object.freeze({ INPUT: "input", SNAPSHOT: "snapshot", JOINED: "joined" });
export const SERVER_ENVELOPE_VERSION = 0;
export const MAX_CHAT_LENGTH = 200;

const brandedEntityId = z
  .number()
  .int()
  .min(0)
  .max(65_535)
  .transform((value) => entityId(value));
const brandedSeq = z
  .number()
  .int()
  .min(0)
  .max(0xffff_ffff)
  .transform((value) => sequenceNumber(value));
const brandedTick = z
  .number()
  .int()
  .min(0)
  .max(0xffff_ffff)
  .transform((value) => tickNumber(value));
const turnSchema = z.union([z.literal(-1), z.literal(0), z.literal(1)]);
const nonBlankString = (max: number) =>
  z
    .string()
    .refine(
      (value) => value.trim().length >= 1 && value.length <= max,
      `must contain 1-${max} characters`,
    );

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    v: z.literal(0),
    type: z.literal("join"),
    room: nonBlankString(64),
    name: nonBlankString(18),
  }),
  z.object({
    v: z.literal(0),
    type: z.literal("input"),
    seq: brandedSeq,
    tick: brandedTick,
    thrust: z.boolean(),
    turn: turnSchema,
    fire: z.boolean(),
  }),
  z.object({
    v: z.literal(0),
    type: z.literal("chat"),
    text: z
      .string()
      .refine(
        (value) => value.trim().length >= 1 && value.length <= MAX_CHAT_LENGTH,
      ),
  }),
  z.object({ v: z.literal(0), type: z.literal("leave") }),
  z.object({
    v: z.literal(0),
    type: z.literal("ping"),
    t: z.number().finite().optional(),
  }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ClientInputMessage = Extract<ClientMessage, { type: "input" }>;

const snapshotBase = {
  id: brandedEntityId,
  x: z.number().finite(),
  y: z.number().finite(),
  vx: z.number().finite(),
  vy: z.number().finite(),
  angle: z.number().finite(),
  radius: z.number().finite().nonnegative(),
  alive: z.boolean(),
};
export const SnapshotEntitySchema = z.discriminatedUnion("kind", [
  z.object({
    ...snapshotBase,
    kind: z.literal("ship"),
    hp: z.number().finite(),
    maxHp: z.number().finite(),
  }),
  z.object({
    ...snapshotBase,
    kind: z.literal("bullet"),
    ownerId: brandedEntityId,
    ttl: z.number().finite(),
    homing: z.boolean(),
  }),
  z.object({
    ...snapshotBase,
    kind: z.literal("asteroid"),
    homing: z.boolean(),
    variant: z.number().int().min(0).max(255),
  }),
  z.object({
    ...snapshotBase,
    kind: z.literal("pickup"),
    variant: z.number().int().min(0).max(255),
  }),
]);
export const SnapshotSchema = z.object({
  version: z.literal(1),
  tick: brandedTick,
  time: z.number().finite(),
  entities: z.array(SnapshotEntitySchema),
  scores: z.record(z.string(), z.number().finite()),
});
export type ValidatedSnapshot = z.infer<typeof SnapshotSchema>;
export type {
  EntityId,
  InputPacket,
  NetworkSnapshot,
  Seq,
  Snapshot,
  SnapshotEntity,
  Tick,
};

const playerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});
export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    v: z.literal(0),
    type: z.literal("joined"),
    room: z.string(),
    playerId: z.string(),
    shipId: brandedEntityId,
    seed: z.number().int(),
    tickRate: z.number().int(),
    protocol: z.enum(["json", "binary"]),
  }),
  z.object({
    v: z.literal(0),
    type: z.literal("snapshot"),
    version: z.literal(1),
    tick: brandedTick,
    time: z.number().finite().optional(),
    entities: z.array(SnapshotEntitySchema),
    scores: z.record(z.string(), z.number().finite()).optional(),
    lastProcessedSeq: brandedSeq,
    score: z.number().finite(),
    serverTime: z.number().finite().optional(),
  }),
  z.object({
    v: z.literal(0),
    type: z.literal("roster"),
    players: z.array(playerSchema),
  }),
  z.object({
    v: z.literal(0),
    type: z.literal("chat"),
    name: z.string(),
    text: z.string(),
    t: z.number(),
  }),
  z.object({ v: z.literal(0), type: z.literal("left") }),
  z.object({
    v: z.literal(0),
    type: z.literal("pong"),
    t: z.number().optional(),
  }),
  z.object({
    v: z.literal(0),
    type: z.literal("errorMessage"),
    message: z.string(),
  }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export type ParseClientMessageResult =
  | { readonly success: true; readonly data: ClientMessage }
  | {
      readonly success: false;
      readonly code: "BAD_JSON" | "MESSAGE_TOO_LARGE" | "INVALID_MESSAGE";
      readonly error: Error;
    };

/** Parses untrusted transport data without throwing, including malformed JSON and oversized frames. */
export function parseClientMessage(
  data: unknown,
  maxBytes = 4096,
): ParseClientMessageResult {
  const text = transportText(data);
  let candidate: unknown = data;
  if (text !== null) {
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      return {
        success: false,
        code: "MESSAGE_TOO_LARGE",
        error: new Error("message too large"),
      };
    }
    try {
      candidate = JSON.parse(text);
    } catch (_error: unknown) {
      return {
        success: false,
        code: "BAD_JSON",
        error: new Error("invalid JSON"),
      };
    }
  }
  const result = ClientMessageSchema.safeParse(candidate);
  if (!result.success)
    return {
      success: false,
      code: "INVALID_MESSAGE",
      error: new Error(
        result.error.issues.map((issue) => issue.message).join("; "),
      ),
    };
  return { success: true, data: result.data };
}

function transportText(data: unknown): string | null {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  if (Array.isArray(data)) {
    const rawParts: readonly unknown[] = data;
    const parts: ArrayBufferView[] = [];
    for (const part of rawParts) {
      if (!ArrayBuffer.isView(part)) return null;
      parts.push(part);
    }
    const length = parts.reduce((total, part) => total + part.byteLength, 0);
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      bytes.set(
        new Uint8Array(part.buffer, part.byteOffset, part.byteLength),
        offset,
      );
      offset += part.byteLength;
    }
    return new TextDecoder().decode(bytes);
  }
  return null;
}

export function parseSnapshot(data: unknown): Snapshot | null {
  const result = SnapshotSchema.safeParse(data);
  return result.success ? result.data : null;
}

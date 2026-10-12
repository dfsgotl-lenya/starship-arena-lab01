import { z } from "zod";
import type { Assets, SpriteSheet } from "../types.ts";

const RETRYABLE_STATUS_MIN = 500;
const SpriteDescriptorSchema = z.object({
  url: z.string().min(1),
  frames: z.number().int().positive().optional(),
  frameWidth: z.number().int().positive(),
  frameHeight: z.number().int().positive(),
});
export const AssetManifestSchema = z.object({
  sprites: z.record(z.string(), SpriteDescriptorSchema).default({}),
  sounds: z.record(z.string(), z.string().min(1)).default({}),
  arena: z.string().min(1).optional(),
});
export type AssetManifest = z.infer<typeof AssetManifestSchema>;
export interface ProgressInfo {
  readonly done: number;
  readonly total: number;
  readonly key: string;
  readonly kind: string;
}
export interface RetryInfo {
  readonly attempt: number;
  readonly waitMs: number;
  readonly error: unknown;
}
export interface RetryOptions {
  readonly attempts?: number;
  readonly baseMs?: number;
  readonly signal?: AbortSignal;
  readonly onRetry?: (info: RetryInfo) => void;
}
export interface LoadOptions {
  readonly signal?: AbortSignal;
  readonly decoderContext?: BaseAudioContext;
  readonly onProgress?: (info: ProgressInfo) => void;
  readonly onRetry?: (
    info: RetryInfo & { readonly key: string; readonly kind: string },
  ) => void;
}
export interface LoadedAssets extends Assets {
  readonly arena: unknown;
}
type SpriteDescriptor = z.infer<typeof SpriteDescriptorSchema>;
type LoadedItem =
  | {
      readonly key: string;
      readonly kind: "sprite";
      readonly value: ImageBitmap;
      readonly descriptor: SpriteDescriptor;
    }
  | {
      readonly key: string;
      readonly kind: "audio";
      readonly value: AudioBuffer;
      readonly url: string;
    }
  | {
      readonly key: "arena";
      readonly kind: "json";
      readonly value: unknown;
      readonly url: string;
    };
type SpriteMeta = Omit<
  Extract<LoadedItem, { readonly kind: "sprite" }>,
  "value"
>;
type AudioMeta = Omit<Extract<LoadedItem, { readonly kind: "audio" }>, "value">;
type ArenaMeta = Omit<Extract<LoadedItem, { readonly kind: "json" }>, "value">;

class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

export function parseAssetManifest(value: unknown): AssetManifest {
  return AssetManifestSchema.parse(value);
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    const onAbort = (): void => {
      window.clearTimeout(timer);
      reject(createAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function createAbortError(): Error {
  const error = new Error("Operation aborted");
  error.name = "AbortError";
  return error;
}

export async function fetchJson(
  url: string,
  { signal }: { readonly signal?: AbortSignal } = {},
): Promise<unknown> {
  const response = await window.fetch(url, { signal });
  if (!response.ok)
    throw new HttpError(`HTTP ${response.status} for ${url}`, response.status);
  const value: unknown = await response.json();
  return value;
}

export async function withRetry<T>(
  fn: (options: {
    readonly signal?: AbortSignal;
    readonly attempt: number;
  }) => Promise<T>,
  { attempts = 3, baseMs = 200, signal, onRetry = () => {} }: RetryOptions = {},
): Promise<T> {
  let lastError: unknown = new Error("retry attempts exhausted");
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (signal?.aborted) throw createAbortError();
    try {
      return await fn({ signal, attempt });
    } catch (error: unknown) {
      lastError = error;
      const status = error instanceof HttpError ? error.status : 0;
      const isAbort = error instanceof Error && error.name === "AbortError";
      const retryable =
        !isAbort && (status === 0 || status >= RETRYABLE_STATUS_MIN);
      if (!retryable || attempt >= attempts) throw error;
      const backoff = baseMs * 2 ** (attempt - 1);
      const jitter = backoff * (0.2 * Math.random());
      const waitMs = Math.round(backoff + jitter);
      onRetry({ attempt, waitMs, error });
      await sleep(waitMs, signal);
    }
  }
  throw lastError;
}

export async function loadImage(
  url: string,
  { signal }: { readonly signal?: AbortSignal } = {},
): Promise<ImageBitmap> {
  const response = await window.fetch(url, { signal });
  if (!response.ok)
    throw new HttpError(`HTTP ${response.status} for ${url}`, response.status);
  const blob = await response.blob();
  if (signal?.aborted) throw createAbortError();
  return window.createImageBitmap(blob);
}

export async function loadAudio(
  context: BaseAudioContext,
  url: string,
  { signal }: { readonly signal?: AbortSignal } = {},
): Promise<AudioBuffer> {
  const response = await window.fetch(url, { signal });
  if (!response.ok)
    throw new HttpError(`HTTP ${response.status} for ${url}`, response.status);
  const arrayBuffer = await response.arrayBuffer();
  if (signal?.aborted) throw createAbortError();
  return context.decodeAudioData(arrayBuffer);
}

export async function loadJson(
  url: string,
  { signal }: { readonly signal?: AbortSignal } = {},
): Promise<unknown> {
  return fetchJson(url, { signal });
}

export async function loadAll(
  manifest: AssetManifest,
  {
    decoderContext,
    onProgress = () => {},
    signal,
    onRetry = () => {},
  }: LoadOptions = {},
): Promise<LoadedAssets> {
  const jobs: Array<Promise<LoadedItem>> = [];
  const sprites: Record<string, SpriteSheet> = {};
  const sounds: Record<string, AudioBuffer> = {};
  let arena: unknown = null;
  const spriteEntries = Object.entries(manifest.sprites);
  const soundEntries = Object.entries(manifest.sounds);
  const total =
    spriteEntries.length + soundEntries.length + (manifest.arena ? 1 : 0);
  let done = 0;

  const track = <Meta extends object, Value>(
    promise: Promise<Value>,
    meta: Meta,
  ): Promise<Meta & { readonly value: Value }> =>
    promise.then((value) => {
      done += 1;
      const key =
        "key" in meta && typeof meta.key === "string" ? meta.key : "unknown";
      const kind =
        "kind" in meta && typeof meta.kind === "string" ? meta.kind : "unknown";
      onProgress({ done, total, key, kind });
      return { ...meta, value };
    });

  for (const [key, descriptor] of spriteEntries) {
    const promise = withRetry(() => loadImage(descriptor.url, { signal }), {
      signal,
      onRetry: (info) => onRetry({ ...info, key, kind: "sprite" }),
    });
    const meta: SpriteMeta = { key, kind: "sprite", descriptor };
    jobs.push(track(promise, meta));
  }

  for (const [key, url] of soundEntries) {
    if (!decoderContext)
      throw new Error(
        "Audio decoder context is required when manifest contains sounds",
      );
    const promise = withRetry(
      () => loadAudio(decoderContext, url, { signal }),
      {
        signal,
        onRetry: (info) => onRetry({ ...info, key, kind: "audio" }),
      },
    );
    const meta: AudioMeta = { key, kind: "audio", url };
    jobs.push(track(promise, meta));
  }

  if (manifest.arena) {
    const url = manifest.arena;
    const promise = withRetry(() => loadJson(url, { signal }), {
      signal,
      onRetry: (info) => onRetry({ ...info, key: "arena", kind: "json" }),
    });
    const meta: ArenaMeta = { key: "arena", kind: "json", url };
    jobs.push(track(promise, meta));
  }

  const loaded = await Promise.all(jobs);
  for (const item of loaded) {
    if (item.kind === "sprite")
      sprites[item.key] = { image: item.value, ...item.descriptor };
    else if (item.kind === "audio") sounds[item.key] = item.value;
    else arena = item.value;
  }
  return { sprites, sounds, arena };
}

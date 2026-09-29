const RETRYABLE_STATUS_MIN = 500;

export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(createAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function createAbortError() {
  const error = new Error("Operation aborted");
  error.name = "AbortError";
  return error;
}

export async function fetchJson(url, { signal } = {}) {
  const response = await window.fetch(url, { signal });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} for ${url}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function withRetry(fn, { attempts = 3, baseMs = 200, signal, onRetry = () => {} } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (signal?.aborted) throw createAbortError();
    try {
      return await fn({ signal, attempt });
    } catch (error) {
      lastError = error;
      const status = Number(error?.status ?? 0);
      const retryable = error?.name !== "AbortError" && (status === 0 || status >= RETRYABLE_STATUS_MIN);
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

export async function loadImage(url, { signal } = {}) {
  const response = await window.fetch(url, { signal });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} for ${url}`);
    error.status = response.status;
    throw error;
  }
  const blob = await response.blob();
  if (signal?.aborted) throw createAbortError();
  return window.createImageBitmap(blob);
}

export async function loadAudio(context, url, { signal } = {}) {
  const response = await window.fetch(url, { signal });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} for ${url}`);
    error.status = response.status;
    throw error;
  }
  const arrayBuffer = await response.arrayBuffer();
  if (signal?.aborted) throw createAbortError();
  return context.decodeAudioData(arrayBuffer);
}

export async function loadJson(url, { signal } = {}) {
  return fetchJson(url, { signal });
}

export async function loadAll(manifest, { decoderContext, onProgress = () => {}, signal, onRetry = () => {} } = {}) {
  const jobs = [];
  const results = { sprites: {}, sounds: {}, arena: null };
  const spriteEntries = Object.entries(manifest.sprites ?? {});
  const soundEntries = Object.entries(manifest.sounds ?? {});
  const total = spriteEntries.length + soundEntries.length + (manifest.arena ? 1 : 0);
  let done = 0;

  const track = (promise, meta) => promise.then((value) => {
    done += 1;
    onProgress({ done, total, key: meta.key, kind: meta.kind });
    return { ...meta, value };
  });

  for (const [key, descriptor] of spriteEntries) {
    const promise = withRetry(() => loadImage(descriptor.url, { signal }), {
      signal,
      onRetry: (info) => onRetry({ ...info, key, kind: "sprite" }),
    });
    jobs.push(track(promise, { key, kind: "sprite", descriptor }));
  }

  for (const [key, url] of soundEntries) {
    const promise = withRetry(() => loadAudio(decoderContext, url, { signal }), {
      signal,
      onRetry: (info) => onRetry({ ...info, key, kind: "audio" }),
    });
    jobs.push(track(promise, { key, kind: "audio", url }));
  }

  if (manifest.arena) {
    const promise = withRetry(() => loadJson(manifest.arena, { signal }), {
      signal,
      onRetry: (info) => onRetry({ ...info, key: "arena", kind: "json" }),
    });
    jobs.push(track(promise, { key: "arena", kind: "json", url: manifest.arena }));
  }

  const loaded = await Promise.all(jobs);
  for (const item of loaded) {
    if (item.kind === "sprite") results.sprites[item.key] = { image: item.value, ...item.descriptor };
    else if (item.kind === "audio") results.sounds[item.key] = item.value;
    else results.arena = item.value;
  }
  return results;
}

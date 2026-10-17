import { fetchJson, loadImage, withRetry } from "./assets/loader.ts";

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Diagnostics element not found: ${selector}`);
  return element;
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "Error";
}

export function mountDiagnostics(root: HTMLElement): void {
  root.innerHTML = `
    <div class="diagnostics-head"><span class="section-label">Async diagnostics</span><small>Run these after joining.</small></div>
    <div class="diagnostics-buttons">
      <button data-test="404">404 sprite</button><button data-test="timeout">network timeout</button>
      <button data-test="abort">abort mid-load</button><button data-test="bad-json">corrupt JSON</button>
      <button data-test="retry">retry 5xx</button><button data-test="benchmark">sequential vs concurrent</button>
    </div><pre id="diagnostics-log">No tests run yet.</pre>`;
  const log = required<HTMLPreElement>(root, "#diagnostics-log");
  const append = (line: string): void => {
    log.textContent =
      `${new Date().toLocaleTimeString()} ${line}\n${log.textContent === "No tests run yet." ? "" : log.textContent}`.trim();
  };

  required<HTMLButtonElement>(root, '[data-test="404"]').addEventListener(
    "click",
    asyncHandler(async () => {
      try {
        await withRetry(() => loadImage("/assets/sprites/missing-sprite.png"), {
          attempts: 3,
        });
      } catch (error: unknown) {
        append(
          `404 sprite recovered: ${errorMessage(error)}; 4xx was not retried.`,
        );
      }
    }),
  );
  required<HTMLButtonElement>(root, '[data-test="timeout"]').addEventListener(
    "click",
    asyncHandler(async () => {
      try {
        await fetchJson("/api/slow?ms=4000", {
          signal: AbortSignal.timeout(500),
        });
      } catch (error: unknown) {
        append(
          `network timeout recovered: ${errorName(error)} (${errorMessage(error)}).`,
        );
      }
    }),
  );
  required<HTMLButtonElement>(root, '[data-test="abort"]').addEventListener(
    "click",
    asyncHandler(async () => {
      const controller = new AbortController();
      const promise = fetchJson("/api/slow?ms=3000", {
        signal: controller.signal,
      });
      window.setTimeout(() => controller.abort(), 120);
      try {
        await promise;
      } catch (error: unknown) {
        append(`abort mid-load recovered: ${errorName(error)}.`);
      }
    }),
  );
  required<HTMLButtonElement>(root, '[data-test="bad-json"]').addEventListener(
    "click",
    asyncHandler(async () => {
      try {
        await fetchJson("/api/bad.json");
      } catch (error: unknown) {
        append(`corrupt JSON recovered: ${errorName(error)}.`);
      }
    }),
  );
  required<HTMLButtonElement>(root, '[data-test="retry"]').addEventListener(
    "click",
    asyncHandler(async () => {
      const key = `demo-${Date.now()}`;
      try {
        const value = await withRetry(
          () => fetchJson(`/api/flaky?key=${key}`),
          {
            attempts: 3,
            baseMs: 120,
            onRetry: ({ attempt, waitMs }) =>
              append(
                `retry backoff: 503 on attempt ${attempt}, waiting ${waitMs} ms + jitter.`,
              ),
          },
        );
        const attempts =
          typeof value === "object" &&
          value !== null &&
          "attempts" in value &&
          typeof value.attempts === "number"
            ? value.attempts
            : "unknown";
        append(`retry test recovered after ${attempts} attempts.`);
      } catch (error: unknown) {
        append(`retry test failed: ${errorMessage(error)}`);
      }
    }),
  );
  required<HTMLButtonElement>(root, '[data-test="benchmark"]').addEventListener(
    "click",
    asyncHandler(async () => {
      const urls = [1, 2, 3, 4].map(
        (index) => `/api/slow?ms=320&n=${index}&t=${Date.now()}`,
      );
      const startSequential = performance.now();
      for (const url of urls) await fetchJson(url);
      const sequentialMs = performance.now() - startSequential;
      const startConcurrent = performance.now();
      await Promise.all(urls.map((url) => fetchJson(url)));
      const concurrentMs = performance.now() - startConcurrent;
      append(
        `benchmark: sequential ${sequentialMs.toFixed(0)} ms vs concurrent ${concurrentMs.toFixed(0)} ms.`,
      );
    }),
  );
}

/** DOM listeners ignore returned promises; make fire-and-forget explicit. */
function asyncHandler(run: () => Promise<void>): () => void {
  return () => {
    void run();
  };
}

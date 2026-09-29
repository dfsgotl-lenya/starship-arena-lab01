import { fetchJson, loadImage, withRetry } from "./assets/loader.js";

export function mountDiagnostics(root) {
  root.innerHTML = `
    <div class="diagnostics-head"><span class="section-label">Async diagnostics</span><small>Run these after joining.</small></div>
    <div class="diagnostics-buttons">
      <button data-test="404">404 sprite</button>
      <button data-test="timeout">network timeout</button>
      <button data-test="abort">abort mid-load</button>
      <button data-test="bad-json">corrupt JSON</button>
      <button data-test="retry">retry 5xx</button>
      <button data-test="benchmark">sequential vs concurrent</button>
    </div>
    <pre id="diagnostics-log">No tests run yet.</pre>
  `;
  const log = root.querySelector("#diagnostics-log");
  const append = (line) => {
    log.textContent = `${new Date().toLocaleTimeString()} ${line}\n${log.textContent === "No tests run yet." ? "" : log.textContent}`.trim();
  };

  root.querySelector('[data-test="404"]').addEventListener("click", async () => {
    try {
      await withRetry(() => loadImage("/assets/sprites/missing-sprite.png"), { attempts: 3 });
    } catch (error) {
      append(`404 sprite recovered: ${error.message}; 4xx was not retried.`);
    }
  });

  root.querySelector('[data-test="timeout"]').addEventListener("click", async () => {
    try {
      await fetchJson("/api/slow?ms=4000", { signal: window.AbortSignal.timeout(500) });
    } catch (error) {
      append(`network timeout recovered: ${error.name} (${error.message}).`);
    }
  });

  root.querySelector('[data-test="abort"]').addEventListener("click", async () => {
    const controller = new window.AbortController();
    const promise = fetchJson("/api/slow?ms=3000", { signal: controller.signal });
    window.setTimeout(() => controller.abort(), 120);
    try {
      await promise;
    } catch (error) {
      append(`abort mid-load recovered: ${error.name}.`);
    }
  });

  root.querySelector('[data-test="bad-json"]').addEventListener("click", async () => {
    try {
      await fetchJson("/api/bad.json");
    } catch (error) {
      append(`corrupt JSON recovered: ${error.name}.`);
    }
  });

  root.querySelector('[data-test="retry"]').addEventListener("click", async () => {
    const key = `demo-${Date.now()}`;
    try {
      const result = await withRetry(() => fetchJson(`/api/flaky?key=${key}`), {
        attempts: 3,
        baseMs: 120,
        onRetry: ({ attempt, waitMs }) => append(`retry backoff: 503 on attempt ${attempt}, waiting ${waitMs} ms + jitter.`),
      });
      append(`retry test recovered after ${result.attempts} attempts.`);
    } catch (error) {
      append(`retry test failed: ${error.message}`);
    }
  });

  root.querySelector('[data-test="benchmark"]').addEventListener("click", async () => {
    const urls = [1, 2, 3, 4].map((i) => `/api/slow?ms=320&n=${i}&t=${Date.now()}`);
    const t1 = window.performance.now();
    for (const url of urls) await fetchJson(url);
    const sequentialMs = window.performance.now() - t1;
    const t2 = window.performance.now();
    await Promise.all(urls.map((url) => fetchJson(url)));
    const concurrentMs = window.performance.now() - t2;
    append(`benchmark: sequential ${sequentialMs.toFixed(0)} ms vs concurrent ${concurrentMs.toFixed(0)} ms.`);
  });
}

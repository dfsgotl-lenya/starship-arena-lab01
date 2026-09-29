export default {
  plugins: [
    {
      name: "lab03-async-test-api",
      configureServer(server) {
        const flakyCounts = new Map();
        server.middlewares.use("/api", (req, res, next) => {
          const url = new globalThis.URL(req.url, "http://localhost");
          const path = url.pathname.replace(/^\/api/, "");
          if (path === "/slow") {
            const ms = Math.min(8000, Math.max(0, Number(url.searchParams.get("ms") ?? 3000)));
            globalThis.setTimeout(() => {
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ ok: true, delayMs: ms }));
            }, ms);
            return;
          }
          if (path === "/flaky") {
            const key = url.searchParams.get("key") ?? "default";
            const count = (flakyCounts.get(key) ?? 0) + 1;
            flakyCounts.set(key, count);
            if (count <= 2) {
              res.statusCode = 503;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ ok: false, attempt: count }));
              return;
            }
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: true, attempts: count }));
            return;
          }
          next();
        });
      },
    },
  ],
};

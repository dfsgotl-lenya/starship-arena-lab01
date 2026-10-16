import { defineConfig } from "vite";

// PERF_BUILD=1 keeps function names readable in CPU/allocation profiles.
const perfBuild = Boolean(globalThis.process?.env?.PERF_BUILD);

export default defineConfig({
  build: {
    minify: perfBuild ? false : "esbuild",
    sourcemap: perfBuild,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:3001", changeOrigin: true },
      "/ws": { target: "ws://127.0.0.1:3001", ws: true, changeOrigin: true },
    },
  },
});

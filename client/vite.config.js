import { defineConfig } from "vite";

// `vite build --mode perf` keeps function names readable in CPU/allocation
// profiles (no minification) and emits source maps.
export default defineConfig(({ mode }) => ({
  build: {
    minify: mode === "perf" ? false : "esbuild",
    sourcemap: mode === "perf",
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:3001", changeOrigin: true },
      "/ws": { target: "ws://127.0.0.1:3001", ws: true, changeOrigin: true },
    },
  },
}));

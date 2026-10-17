import { defineConfig } from "vitest/config";

/**
 * One Vitest run over the three workspaces (each has its own config).
 * Coverage: shared/ must stay ≥ 85 % (CI fails otherwise).
 */
export default defineConfig({
  test: {
    projects: ["shared", "server", "client"],
    coverage: {
      provider: "v8",
      include: ["shared/**/*.ts", "server/src/**/*.ts", "client/src/**/*.ts"],
      exclude: [
        "**/test/**",
        "**/*.d.ts",
        "**/*.worker.ts",
        "**/vitest.config.ts",
      ],
      reporter: ["text-summary", "text", "html", "json-summary"],
      thresholds: {
        "shared/**/*.ts": {
          lines: 85,
          statements: 85,
          functions: 85,
          branches: 80,
        },
      },
    },
  },
});

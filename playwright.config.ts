import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;

/**
 * E2E: the real server (serving the built client) + two isolated browser
 * contexts in the same room. `npm run test:e2e` builds the client first.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"]
    ? [["list"], ["html", { open: "never" }]]
    : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run build && node --import tsx server/src/index.ts",
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      HOST: "127.0.0.1",
      MESSAGE_RATE: "60",
      LOG_DIR: "./logs/e2e",
    },
  },
});

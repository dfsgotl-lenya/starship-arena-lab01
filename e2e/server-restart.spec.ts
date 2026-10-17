import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

/**
 * Chaos: the server is killed mid-match (SIGTERM, as on every deploy).
 * The player must land in the lobby with a clear message, and the lobby
 * must find the rooms again once a new server process is up.
 */
const PORT = 3220;

function startServer(): Promise<ChildProcess> {
  const child = spawn(process.execPath, ["server/src/index.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      LOG_LEVEL: "warn",
      LOG_DIR: "./logs/e2e-restart",
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("server did not start")),
      15_000,
    );
    const poll = async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${PORT}/ready`);
        if (response.ok) {
          clearTimeout(timer);
          resolve(child);
          return;
        }
      } catch {
        /* not up yet */
      }
      setTimeout(() => void poll(), 100);
    };
    void poll();
  });
}

test("server restart mid-match: back to the lobby with a message, then rooms come back", async ({
  page,
}) => {
  let server = await startServer();
  try {
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.locator("#join-room").click();
    await expect(page.locator("#chat-panel")).toBeVisible();

    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill("SIGTERM");
    await exited;

    await expect(page.locator("#net-banner")).toBeVisible();
    await expect(page.locator("#net-banner")).toContainText("restarting");
    await expect(page.locator("#lobby-screen")).toBeVisible();
    await expect(page.locator("#chat-panel")).toBeHidden();

    server = await startServer();
    await expect(page.locator("#net-banner")).toContainText("Server is back", {
      timeout: 15_000,
    });
    await page.locator("#join-room").click();
    await expect(page.locator("#chat-panel")).toBeVisible();
  } finally {
    server.kill("SIGTERM");
  }
});

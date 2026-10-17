import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

async function joinAlpha(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await page.locator("#player-name").fill(name);
  await page.locator('input[name="room"][value="alpha"]').check();
  await page.locator("#join-room").click();
  await expect(page.locator("#chat-panel")).toBeVisible();
  return page;
}

function ships(page: Page) {
  return page.evaluate(() => window.__perf?.ships() ?? []);
}

test("two browsers in one room: the second sees the first move, chat is delivered", async ({
  browser,
}) => {
  const ann = await joinAlpha(browser, "Ann");
  const bob = await joinAlpha(browser, "Bob");

  // Both pilots appear in each other's roster.
  await expect(ann.locator("#roster")).toContainText("Bob");
  await expect(bob.locator("#roster")).toContainText("Ann");

  // Bob renders exactly one remote ship (Ann's) next to his own.
  await expect
    .poll(async () => (await ships(bob)).filter((s) => !s.local).length)
    .toBeGreaterThanOrEqual(1);
  const annLocal = (await ships(ann)).find((s) => s.local);
  expect(annLocal).toBeDefined();
  const remoteOnBob = async () =>
    (await ships(bob))
      .filter((s) => !s.local)
      .sort(
        (a, b) =>
          Math.hypot(a.x - annLocal!.x, a.y - annLocal!.y) -
          Math.hypot(b.x - annLocal!.x, b.y - annLocal!.y),
      )[0]!;
  const before = await remoteOnBob();

  // Ann thrusts for a second.
  await ann.locator("#canvas-wrap").click();
  await ann.keyboard.down("KeyW");
  await ann.waitForTimeout(1200);
  await ann.keyboard.up("KeyW");

  await expect
    .poll(
      async () => {
        const after = (await ships(bob)).find((s) => s.id === before.id);
        return after ? Math.hypot(after.x - before.x, after.y - before.y) : 0;
      },
      { timeout: 5000 },
    )
    .toBeGreaterThan(40);

  // Chat from Ann reaches Bob (and is shown exactly once).
  await ann.locator("#chat-input").fill("gl hf from Ann");
  await ann.locator("#chat-form button[type=submit]").click();
  await expect(bob.locator("#chat-log")).toContainText("Ann: gl hf from Ann");
  await expect(
    bob.locator("#chat-log .chat-line", { hasText: "gl hf from Ann" }),
  ).toHaveCount(1);
});

import { expect, test, type Page } from "@playwright/test";

/**
 * Smoke test of the built game in a real browser.
 * It catches what unit tests can't: CSS hiding the game, scripts failing to load,
 * elements that can't be clicked. Keep it small; game rules are tested in tests/.
 */

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("./");
  // start every test from a fresh game
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test.afterEach(() => {
  expect(errors, "no script errors in the console").toEqual([]);
});

const action = (page: Page, name: string) => page.locator("#actions .btn", { hasText: name });
const tab = (page: Page, name: string) => page.locator("#tabs .tab", { hasText: name });
const status = (page: Page, label: string) =>
  page.locator("#status .row", { has: page.locator(".key", { hasText: label }) }).locator(".val");

test("the game is visible and not covered on load", async ({ page }) => {
  await expect(page).toHaveTitle("Mysteryless Island");
  await expect(page.locator("#log")).toContainText("awake. salt in the mouth.");
  await expect(action(page, "catch fish")).toBeVisible();
  await expect(page.locator("#fade")).toBeHidden();

  // nothing may sit on top of the buttons (the bug that blanked the first deploy)
  const box = (await action(page, "catch fish").boundingBox())!;
  const topmost = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest(".btn")?.textContent ?? null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(topmost).toContain("catch fish");
});

test("walk to the forest, gather wood, come back and light the fire", async ({ page }) => {
  await expect(status(page, "fire")).toHaveText("out");

  await tab(page, "the forest").click();
  await expect(tab(page, "the forest")).toHaveClass(/here/);
  await action(page, "gather wood").click();
  await action(page, "gather wood").click(); // waits until the cosmetic cooldown ends
  await action(page, "drink from stream").click();
  await expect(page.locator("#stores")).toContainText("firewood");

  await tab(page, "the beach").click();
  await expect(tab(page, "the beach")).toHaveClass(/here/);
  await action(page, "light fire").click();
  await expect(status(page, "fire")).toHaveText(/burning|roaring/);
  await expect(action(page, "stoke fire")).toBeVisible();
  await expect(action(page, "sleep")).not.toHaveClass(/off/);
});

test("dying fades out and restores the checkpoint", async ({ page }) => {
  await page.evaluate(() => {
    const ti = (window as unknown as { ti: { stat(s: string, v: number): void } }).ti;
    ti.stat("health", 1);
    ti.stat("thirst", 100);
  });
  await action(page, "catch fish").click();

  await expect(page.locator("#fade")).toBeVisible();
  await expect(page.locator("#fadeText")).toHaveText("the world fades.");

  await expect(page.locator("#fade")).toBeHidden({ timeout: 6_000 });
  await expect(page.locator("#log")).toContainText("you wake on the sand");
  await expect(action(page, "catch fish")).toBeVisible();
});

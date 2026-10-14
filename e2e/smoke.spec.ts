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
  // ?speed=0.2 runs progress bars 5x faster so the flows finish quickly; the pacing test below uses normal speed
  await page.goto("./?speed=0.2");
  // start every test from a fresh game
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test.afterEach(() => {
  expect(errors, "no script errors in the console").toEqual([]);
});

const action = (page: Page, name: string) => page.locator("#actions .btn", { hasText: name });
const tab = (page: Page, name: string) => page.locator("#tabs .tab", { hasText: name });

test("the game is visible and not covered on load", async ({ page }) => {
  await expect(page).toHaveTitle("Mysteryless Island");
  await expect(page.locator("#log")).toContainText("awake. salt in the mouth.");
  // the game starts with a single button
  await expect(page.locator("#actions .btn")).toHaveCount(1);
  await expect(action(page, "look around")).toBeVisible();
  await expect(page.locator("#fade")).toBeHidden();

  // survival stats are ink bars with the word on hover
  const health = page.locator('#status .row[data-id="health"]');
  await expect(health.getByRole("meter")).toHaveAttribute("aria-valuenow", "80");
  await expect(health.locator(".bar i")).toHaveAttribute("style", /width: 80%/);
  const barWidth = await health.locator(".bar i").evaluate((el) => el.getBoundingClientRect().width);
  expect(barWidth).toBeGreaterThan(40); // the fill is actually drawn, not 0px
  await expect(health).toHaveAttribute("aria-label", /health: bruised/);
  await health.hover();
  await expect(health.locator(".tip")).toBeVisible();
  await expect(health.locator(".tip")).toContainText("bruised");

  // the first task is listed; the inventory holds the starting kit
  await expect(page.locator("#quests .quest .title")).toHaveText(["survive the first night"]);
  await expect(page.locator("#inventory .row .key")).toHaveText(["knife", "summer clothes"]);

  // nothing may sit on top of the buttons (the bug that blanked the first deploy)
  const box = (await action(page, "look around").boundingBox())!;
  const topmost = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest(".btn")?.textContent ?? null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(topmost).toContain("look around");
});

test("explore the beach and forest, collect wood, drink, come back and light the fire", async ({ page }) => {
  await expect(page.locator('#status .row[data-id="fire"]')).toHaveCount(0);
  await expect(page.locator('#status .row[data-id="comfort"] .key')).toHaveText("comfort");

  // beach: the forest first, then the rocks with cover
  await expect(tab(page, "the forest")).toHaveCount(0);
  await action(page, "look around").click();
  await expect(tab(page, "the forest")).toBeVisible();
  await expect(action(page, "light fire")).toHaveCount(0);
  await action(page, "look around").click(); // waits until the cosmetic cooldown ends
  await expect(action(page, "light fire")).toBeVisible();

  // forest: dry wood, then the spring
  await tab(page, "the forest").click();
  await expect(tab(page, "the forest")).toHaveClass(/here/);
  await action(page, "look around").click();
  await action(page, "collect wood").click();
  await action(page, "look around").click();
  await action(page, "collect wood").click();
  await action(page, "drink water").click();
  await expect(page.locator("#stores")).toContainText("firewood");
  // still day 1: the night task stays active
  await expect(page.locator('#quests .quest[data-id="survive_first_night"]')).not.toHaveClass(/done/);

  await tab(page, "the beach").click();
  await expect(tab(page, "the beach")).toHaveClass(/here/);
  // raw food gets a fire icon only once the fire is lit
  await page.evaluate(() => (window as unknown as { ti: { give(i: string, n: number): void } }).ti.give("raw_fish", 1));
  const cook = page.locator('#stores .row[data-id="raw_fish"] .iaction');
  await expect(cook).toHaveCount(0);
  await action(page, "light fire").click();
  await expect(page.locator("#log")).toContainText("the fire takes");
  await expect(action(page, "stoke fire")).toBeVisible();
  await expect(action(page, "sleep")).not.toHaveClass(/off/);
  await expect(cook).toBeVisible();
  await cook.click();
  await expect(page.locator('#stores .row[data-id="cooked_fish"]')).toBeVisible();
});

test("finding the fish starts the spear task; building it puts the spear in the inventory", async ({ page }) => {
  for (let i = 0; i < 4; i++) await action(page, "look around").click();
  const quest = page.locator('#quests .quest[data-id="build_fishing_spear"]');
  await expect(quest.locator(".progress")).toHaveText("firewood 0/10");
  await expect(quest.locator(".qaction")).toHaveClass(/off/);

  await page.evaluate(() => (window as unknown as { ti: { give(i: string, n: number): void } }).ti.give("firewood", 10));
  await expect(quest.locator(".progress")).toHaveText("firewood 10/10");
  await quest.locator(".qaction").click();
  await expect(page.locator("#inventory")).toContainText("fishing spear");
  await expect(quest).toHaveCount(0, { timeout: 5_000 });
  await expect(action(page, "catch fish")).not.toHaveClass(/off/);
});

test("while an action runs, the controls are locked and greyed out", async ({ page }) => {
  await page.goto("./"); // normal speed
  await action(page, "look around").click();
  await expect(page.locator("#wrap")).toHaveClass(/busy/);
  await expect(page.locator("#wrap")).toHaveAttribute("aria-busy", "true");
  // the new tab is visible but greyed out and does nothing
  await expect(tab(page, "the forest")).toBeDisabled();
  // a second click on look around is ignored
  await action(page, "look around").dispatchEvent("click");
  await page.waitForTimeout(1500);
  await expect(page.locator("#wrap")).toHaveClass(/busy/); // still running: the bar takes a few seconds
  await expect(page.locator("#wrap")).not.toHaveClass(/busy/, { timeout: 6_000 });
  const explored = await page.evaluate(() =>
    (window as unknown as { ti: { state(): { regions: { beach: { explored: number } } } } }).ti.state().regions.beach.explored);
  expect(explored).toBe(1);
});

test("every layout can be chosen from the menu, shows all panels, plays, and is remembered", async ({ page }) => {
  const layouts = ["journal", "scene", "notebook", "bujo", "stage", "classic"];
  for (const [i, id] of layouts.entries()) {
    await page.locator("#layoutBtn").click();
    await expect(page.locator("#layoutMenu")).toBeVisible();
    await page.locator(`#layoutMenu [data-layout="${id}"]`).click();
    await expect(page.locator("#layoutMenu")).toBeHidden();
    await expect(page.locator("#layoutBtn")).toHaveText(`layout: ${id === "bujo" ? "bullet journal" : id}.`);
    await expect(page.locator("#app")).toHaveClass(new RegExp(`layout-${id}`));
    // the same panels in every layout
    await expect(page.locator("#log")).toContainText("awake. salt in the mouth.");
    await expect(page.locator("#status .row")).toHaveCount(5);
    await expect(page.locator("#quests .quest .title")).toHaveText(["survive the first night"]);
    await expect(page.locator("#inventory .row .key")).toHaveText(["knife", "summer clothes"]);
    // and the game plays: one more look around per layout (4 beach finds, then the button is gone)
    if (i < 4) {
      await action(page, "look around").click();
      await expect(page.locator("#wrap")).not.toHaveClass(/busy/, { timeout: 5_000 });
    }
  }
  await expect(page.locator("#log")).toContainText("a school of small fish");

  // the choice survives a reload
  await page.locator("#layoutBtn").click();
  await page.locator('#layoutMenu [data-layout="notebook"]').click();
  await page.reload();
  await expect(page.locator("#layoutBtn")).toHaveText("layout: notebook.");
  await expect(page.locator("#log .entry.latest")).toBeVisible();
});

test("dying fades out and restores the checkpoint", async ({ page }) => {
  await page.evaluate(() => {
    const ti = (window as unknown as { ti: { stat(s: string, v: number): void } }).ti;
    ti.stat("health", 1);
    ti.stat("thirst", 100);
  });
  await action(page, "look around").click();

  await expect(page.locator("#fade")).toBeVisible();
  await expect(page.locator("#fadeText")).toHaveText("the world fades.");

  await expect(page.locator("#fade")).toBeHidden({ timeout: 6_000 });
  await expect(page.locator("#log")).toContainText("you wake on the sand");
  await expect(action(page, "look around")).toBeVisible();
});

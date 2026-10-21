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
  // ?speed=0.01 runs progress bars 100x faster so the flows finish quickly; the pacing test below uses normal speed.
  // ?variants=first always shows the first wording of each text, so the checks below can name it.
  await page.goto("./?speed=0.01&variants=first");
  // start every test from a fresh game, past the shipwreck with the knife (the "the story starts" test plays it)
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await escapeShip(page, "knife");
});

test.afterEach(() => {
  expect(errors, "no script errors in the console").toEqual([]);
});

const action = (page: Page, name: string) => page.locator(".action-sections .btn", { hasText: name });

const tooltip = (page: Page) => page.locator("#treeTooltip");
const node = (page: Page, kind: "craft" | "build", target: string) => page.locator(`#${kind}Tree .tree-node[data-target="${target}"]`);
async function create(page: Page, kind: "craft" | "build", target: string) {
  await page.locator(`#${kind}Tab`).click();
  await node(page, kind, target).locator(".btn").click();
  await page.locator("#areaTab").dispatchEvent("click");
  await expect(page.locator("#wrap")).not.toHaveClass(/busy/, { timeout: 20_000 });
}

/** Long playthroughs can run out of provisions; acknowledge their warning before continuing. */
async function dismissProvisionWarning(page: Page) {
  if (await page.locator("#event").isVisible() && await page.locator("#eventTitle").textContent() === "Supplies running low") {
    await expect(page.locator("#eventText")).toContainText("collapse");
    await page.locator("#eventBack").click();
  }
}

/**
 * "look around" opens a pop-up; explore one landmark (by id, or the first offered), then close
 * what was found. The look-around button shows the timed exploration progress.
 */
async function explore(page: Page, landmark?: string) {
  await action(page, "look around").click();
  const pick = landmark
    ? page.locator(`#eventChoices [data-choice="${landmark}"]`)
    : page.locator('#eventChoices .btn:not([data-choice="close"])').first();
  const id = await pick.getAttribute("data-choice");
  await pick.click();
  await expect(page.locator("#wrap")).not.toHaveClass(/busy/, { timeout: 20_000 });
  // what was found; the dunes and the cliff top put a place on the map, so those findings can also walk there
  const go: Record<string, string> = { forest_edge: "go to the forest30m", cliff_top: "go to the meadows1h" };
  if (id && go[id]) await expect(page.locator("#eventChoices .btn")).toHaveText([go[id]]);
  else await expect(page.locator("#eventChoices .btn")).toHaveCount(0);
  await expect(page.locator("#eventBack")).toBeVisible();
  await page.locator("#eventBack").click();
  await dismissProvisionWarning(page);
  await expect(page.locator("#event")).toBeHidden();
}

/** The opening event: grab one thing from the sinking ship, then close the swim to the shore. */
async function escapeShip(page: Page, choice: "knife" | "matches" | "water" | "rations") {
  await page.locator(`#eventChoices [data-choice="${choice}"]`).click();
  await page.locator('#eventChoices [data-choice="close"]').click();
  await expect(page.locator("#event")).toBeHidden();
}
const tab = (page: Page, name: string) => page.locator("#tabs .tab", { hasText: name });

test("at midnight the player collapses where they are and wakes at 6am with a new-day summary", async ({ page }) => {
  await explore(page, "forest_edge");
  await tab(page, "the forest").click();
  await expect(page.locator("#wrap")).not.toHaveClass(/busy/);
  await page.evaluate(() => {
    const ti = (window as unknown as { ti: { time(h: number): void; stat(s: string, v: number): void } }).ti;
    ti.time(16.75); // 7am -> 11:45pm
    ti.stat("hunger", 0);
    ti.stat("thirst", 0);
  });
  await tab(page, "the beach").click(); // the attempted walk reaches midnight and is interrupted
  await expect(tab(page, "the forest")).toHaveClass(/here/);
  await expect(page.locator("#clock")).toContainText("06:00");
  await expect(page.locator("#log")).toContainText("New day 2 is starting.");
  await expect(page.locator("#log")).toContainText("without a bed at");
  const state = await page.evaluate(() =>
    (window as unknown as { ti: { state(): { stats: Record<string, number>; location: string; time: number } } }).ti.state());
  expect(state.stats.energy).toBe(50);
  expect(state.time).toBe(1800);
  expect(state.location).toBe("forest");
  await expect(page.locator("#eventTitle")).toHaveText("You passed out");
  await expect(page.locator("#eventText")).toContainText("You did not get to bed in time.");
  await expect(page.locator("#eventText")).toContainText("the forest");
  await page.locator("#eventBack").click();
  await expect(page.locator("#eventTitle")).toHaveText("Task done: survive the first night");
  await page.locator("#eventBack").click();
  await expect(action(page, "sleep")).toHaveCount(0);
  await tab(page, "the beach").click();
  await explore(page, "rock_shelter");
  await page.evaluate(() => {
    const ti = (window as unknown as { ti: { give(i: string, n: number): void } }).ti;
    ti.give("timber", 2);
    ti.give("firewood", 7);
    ti.give("stone", 2);
    ti.give("matches", 1);
  });
  await expect(page.locator('#quests .quest[data-id="better_sleep"]')).toBeVisible();
  await create(page, "build", "campfire");
  await create(page, "build", "bed");
  await page.locator("#eventBack").click();
  await action(page, "light fire").click();
  await expect(page.locator("#eventTitle")).toHaveText("Task done: better sleep");
  await page.locator("#eventBack").click();
  await expect(action(page, "sleep")).toBeVisible();
  await tab(page, "the forest").click();
  await expect(action(page, "sleep")).toHaveCount(0);
  await tab(page, "the beach").click();
  await action(page, "sleep").click();
  await expect(page.locator("#wrap")).not.toHaveClass(/busy/);
  await expect(page.locator("#log")).toContainText("New day 3 is starting.");
  await expect(page.locator("#log")).toContainText("with 100% energy");
  await expect(tab(page, "the beach")).toHaveClass(/here/);
});

test("automatic provisions warn about raw meat, unlock the shared rack, and consume prepared food and water", async ({ page }) => {
  await explore(page, "rock_shelter");
  await page.evaluate(() => {
    const ti = (window as unknown as { ti: { give(i: string, n: number): void; stat(s: string, v: number): void } }).ti;
    ti.give("raw_meat", 2);
    ti.give("timber", 2);
    ti.give("stone", 2);
    ti.stat("hunger", 60);
    ti.stat("thirst", 70);
  });
  await action(page, "look around").click();
  await page.locator("#eventBack").click();
  await expect(page.locator("#eventTitle")).toHaveText("Supplies running low");
  await expect(page.locator("#eventText")).toContainText("Eat and drink soon");
  await expect(page.locator("#eventText")).toContainText("build a simple drying rack");
  await expect(page.locator("#eventText")).toContainText("cook them over a fire");
  await expect(page.locator('#consumables .control-row[data-id="raw_meat"] .use')).toHaveCount(0);
  await expect(page.locator('#quests .quest[data-id="build_drying_rack"]')).toBeVisible();
  await page.locator("#eventBack").click();
  await create(page, "build", "campfire");
  await create(page, "build", "drying_rack");
  await expect(page.locator("#eventTitle")).toHaveText("Task done: build a drying rack");
  await page.locator("#eventBack").click();
  const rack = page.locator('#buildings .control-row[data-id="drying_rack"]');
  await expect(rack).toHaveCount(1);
  await rack.locator(".btn", { hasText: "dry raw meat" }).click();
  await expect(rack.locator(".val")).toHaveText("drying · 12h");
  await page.evaluate(() => {
    const ti = (window as unknown as { ti: { stat(s: string, v: number): void; time(h: number): void } }).ti;
    ti.stat("hunger", 0);
    ti.stat("thirst", 0);
    ti.time(12);
  });
  await rack.locator(".btn").click();
  await expect(page.locator('#consumables .control-row[data-id="dried_meat"]')).toBeVisible();
  await page.evaluate(() => {
    const ti = (window as unknown as { ti: { give(i: string, n: number): void; stat(s: string, v: number): void } }).ti;
    ti.give("can_water", 1);
    ti.stat("hunger", 70);
    ti.stat("thirst", 70);
  });
  await action(page, "look around").click();
  await page.locator("#eventBack").click();
  await expect(page.locator("#event")).toBeHidden();
  const state = await page.evaluate(() =>
    (window as unknown as { ti: { state(): { stats: Record<string, number>; items: Record<string, number> } } }).ti.state());
  expect(state.stats.hunger).toBeLessThan(60);
  expect(state.stats.thirst).toBeLessThan(60);
  expect(state.items.dried_meat).toBe(1);
  expect(state.items.can_water).toBe(0);
});

test("a finding that opens a place: 'go to the forest' walks there", async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await escapeShip(page, "knife");
  await action(page, "look around").click();
  await page.locator('#eventChoices [data-choice="forest_edge"]').click();
  await expect(page.locator("#eventText")).toContainText("A new place is on your map: the forest.");
  await page.locator('#eventChoices [data-choice="go:forest"]').click();
  await expect(page.locator("#event")).toBeHidden();
  await expect(tab(page, "the forest")).toHaveClass(/here/);
});

test("the meadows: a ? to the west from the start; climbing the cliff with a rope opens them, an hour away", async ({ page }) => {
  await expect(page.locator("#tabs .map-unknown")).toHaveCount(2); // the forest and the meadows, from the start
  await explore(page, "rock_shelter");
  await explore(page, "cliff_shells");
  await expect(page.locator("#tabs .map-unknown")).toHaveCount(2);
  // too steep without a rope
  await action(page, "look around").click();
  await expect(page.locator('#eventChoices [data-choice="cliff_top"]')).toHaveClass(/off/);
  await expect(page.locator('#eventChoices [data-choice="cliff_top"]')).toHaveAttribute("title", "Too steep to climb without a rope");
  await page.locator("#eventBack").click();
  await expect(page.locator('#quests .quest[data-id="climb_cliff"] .needs')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { ti: { give(i: string, n: number): void } }).ti.give("cordage", 1));
  await expect(page.locator('#quests .quest[data-id="climb_cliff"] .needs')).toHaveCount(0);
  await action(page, "look around").click();
  await page.locator('#eventChoices [data-choice="cliff_top"]').click();
  await expect(page.locator("#eventText")).toContainText("A new place is on your map: the meadows.");
  await page.locator('#eventChoices [data-choice="go:meadows"]').click();
  await expect(tab(page, "the meadows")).toHaveClass(/here/);
  // the climb was a task: its note opens on arrival
  await expect(page.locator("#eventTitle")).toHaveText("Task done: climb the cliff");
  await page.locator("#eventBack").click();
  await expect(page.locator("#event")).toBeHidden();
  await explore(page, "berry_bushes");
  await explore(page, "river");
  for (const a of ["pick berries", "drink water", "catch fish"]) await expect(action(page, a)).toBeVisible();
  await expect(page.getByRole("tab", { name: "building", exact: true })).toBeVisible();
  // the river starts the fish trap task: 20 willow twigs; built from the building tree; then it is in the buildings panel
  const task = page.locator('#quests .quest[data-id="build_fish_trap"]');
  await expect(task).toBeVisible();
  await action(page, "cut willow twigs").click();
  await action(page, "cut willow twigs").click();
  await expect(task.locator(".progress")).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { ti: { give(i: string, n: number): void } }).ti.give("stone", 2));
  await create(page, "build", "campfire");
  await create(page, "build", "fish_trap");
  const trap = page.locator('#buildings .control-row[data-id="fish_trap"]');
  await expect(page.locator("#eventTitle")).toHaveText("Task done: build a fish trap");
  await expect(page.locator("#eventText")).toContainText("Fish trap built.");
  await page.locator("#eventBack").click();
  await expect(trap.locator(".val")).toHaveText("not set");
  await trap.locator(".btn").click();
  await expect(trap.locator(".val")).toHaveText("set · 2h");
});

test("the story starts with the shipwreck: grab one thing, swim to the shore", async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const event = page.locator("#event");
  await expect(event).toBeVisible();
  await expect(page.locator("#eventTitle")).toHaveText("The storm");
  await expect(page.locator("#eventText")).toContainText("There is a moment, no more, to grab one thing");
  await expect(page.locator("#eventChoices .btn")).toHaveText(["the knife", "the matches", "the water can", "the rations"]);
  // the island is not there yet: only the event is shown
  await expect(page.locator("#app")).toHaveClass(/prologue/);
  await expect(page.locator("#game")).toBeHidden();

  await page.locator('#eventChoices [data-choice="matches"]').click();
  await expect(page.locator("#eventText")).toContainText("The tin is still there, still shut.");
  // the story before the island ends with a button under the text, not the back arrow
  await expect(page.locator("#eventChoices .btn")).toHaveText(["wash ashore"]);
  await expect(page.locator("#eventBack")).toBeHidden();
  await page.locator('#eventChoices [data-choice="close"]').click();
  await expect(event).toBeHidden();
  // the journal tells it all as one story: the storm, the swim, then the beach
  await expect(page.locator("#log")).toContainText("You were three days out when the storm came.");
  await expect(page.locator("#log")).toContainText("The tin is still there, still shut.");
  await expect(page.locator("#log")).toContainText("Awake. Salt in the mouth.");
  await expect(page.locator("#inventory")).toContainText("matches");
  await expect(page.locator("#inventory .row .key")).toHaveText(["matches", "summer clothes"]);

  // the choice is saved: a reload goes straight to the beach
  await page.reload();
  await expect(event).toBeHidden();
  await expect(action(page, "look around")).toBeVisible();
});

test("the game is visible and not covered on load", async ({ page }) => {
  await expect(page).toHaveTitle("Mysteryless Island");
  await expect(page.locator("#log")).toContainText("Awake. Salt in the mouth.");
  // look around is available immediately; sleep requires a local bed
  await expect(page.locator("#actions .btn .label")).toHaveText(["look around*"]);
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
  await expect(page.locator('#inventory .row[data-id="knife"] .itags')).toHaveText("sharp"); // what it is good for

  // nothing may sit on top of the buttons (the bug that blanked the first deploy)
  const box = (await action(page, "look around").boundingBox())!;
  const topmost = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest(".btn")?.textContent ?? null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(topmost).toContain("look around");
});

test("shared panorama and framed columns stay readable across tabs and screen widths", async ({ page }) => {
  const panorama = page.locator("#areaPanorama");
  await expect(panorama).toHaveCount(1);
  await expect(panorama).toBeVisible();
  const banner = panorama.locator("img");
  await expect(banner).toHaveAttribute("src", /illustrations\/island-panorama\.png$/);
  await expect(banner).toHaveJSProperty("naturalWidth", 2116);
  expect(await panorama.evaluate((el) => !!(el.compareDocumentPosition(document.querySelector("#tabs")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  expect(await panorama.evaluate((el) => el.closest('[role="tabpanel"]') === null)).toBe(true);
  const heading = page.locator("#regionTitle");
  for (const width of [1280, 1051, 1050, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const kind of ["area", "craft", "build"]) {
      await page.locator(`#${kind}Tab`).click();
      await expect(heading).toBeVisible();
      await expect(heading).toHaveText("A Grey Beach");
      await expect(page.locator("#log")).toBeVisible();
      await expect(panorama).toBeVisible();
      await expect(banner).toHaveAttribute("src", /illustrations\/island-panorama\.png$/);
      const journal = (await page.locator(".journal").boundingBox())!;
      const centre = (await page.locator("main.centre").boundingBox())!;
      const side = (await page.locator("aside.side").boundingBox())!;
      const map = (await page.locator("#tabs").boundingBox())!;
      for (const frame of [".journal", "main.centre", "aside.side"]) {
        await expect(page.locator(frame)).toHaveCSS("border-left-width", "1px");
        await expect(page.locator(frame)).toHaveCSS("border-right-width", "1px");
      }
      if (width > 1050) {
        expect(journal.x + journal.width - centre.x).toBeLessThanOrEqual(1);
        expect(centre.x + centre.width - side.x).toBeLessThanOrEqual(1);
        expect(journal.y).toBeLessThan(centre.y);
        expect(side.y).toBeLessThan(centre.y);
        expect(map.x).toBeGreaterThanOrEqual(journal.x + journal.width);
        expect(map.x + map.width).toBeLessThanOrEqual(side.x + 1);
        expect(map.y + map.height).toBeLessThanOrEqual(centre.y);
      } else {
        expect(map.y + map.height).toBeLessThanOrEqual(centre.y);
        expect(journal.y).toBeGreaterThanOrEqual(centre.y + centre.height);
        expect(side.y).toBeGreaterThanOrEqual(journal.y + journal.height);
      }
      const statusBox = (await page.locator(".status-box").boundingBox())!;
      const statusRight = statusBox.x + statusBox.width;
      for (const bar of await page.locator(".status-box .bar").all()) {
        const box = (await bar.boundingBox())!;
        expect(box.x + box.width).toBeLessThan(statusRight);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    }
  }
});

test("explore the beach and forest, collect wood, drink, come back and light the fire", async ({ page }) => {
  await expect(page.locator('#status .row[data-id="fire"]')).toHaveCount(0);
  await expect(page.locator('#status .row[data-id="comfort"] .key')).toHaveText("comfort");

  // look around: a pop-up with what you see and the landmarks, each with its time; close takes no time
  await expect(action(page, "look around")).toContainText("*"); // something left to explore
  await action(page, "look around").click();
  await expect(page.locator("#eventText")).toContainText("Behind the dunes, a dark line of trees.");
  await expect(page.locator('#eventChoices [data-choice="forest_edge"]')).toHaveText("the dunes30m");
  // no close button: "← back" in the title line, on the right, level with the title
  await expect(page.locator('#eventChoices [data-choice="close"]')).toHaveCount(0);
  await expect(page.locator("#eventBack")).toHaveText("← back");
  const backBox = (await page.locator("#eventBack").boundingBox())!;
  const titleBox = (await page.locator("#eventTitle").boundingBox())!;
  const textBox = (await page.locator("#eventText").boundingBox())!;
  expect(Math.abs(backBox.y + backBox.height / 2 - (titleBox.y + titleBox.height / 2))).toBeLessThan(3);
  expect(backBox.x).toBeGreaterThan(titleBox.x + titleBox.width);
  expect(Math.abs(backBox.x + backBox.width - (textBox.x + textBox.width))).toBeLessThan(6);
  // a click next to the pop-up closes it, like close
  await page.mouse.click(5, 5);
  await expect(page.locator("#event")).toBeHidden();
  // so does Escape
  await action(page, "look around").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#event")).toBeHidden();

  // beach: the dunes (the forest), then the ring of rocks (fire and sleep)
  // the route map: only the beach, and a ? on each side where something is still to be found
  await expect(tab(page, "the forest")).toHaveCount(0);
  await expect(page.locator("#tabs .map-unknown")).toHaveCount(2);
  await explore(page, "forest_edge");
  await expect(tab(page, "the forest")).toBeVisible();
  await expect(page.locator("#tabs .map-time")).toHaveText(["30m"]);
  // the map is centred on the place you are in
  const centred = async (name: string) => {
    const map = (await page.locator("#tabs").boundingBox())!;
    const node = (await tab(page, name).boundingBox())!;
    expect(Math.abs(node.x + node.width / 2 - (map.x + map.width / 2)), `${name} in the middle of the map`).toBeLessThan(2);
  };
  await expect(tab(page, "the beach")).toHaveClass(/here/);
  await centred("the beach");
  await expect(page.locator("#tabs .map-unknown")).toHaveCount(1); // the meadows
  await expect(action(page, "light fire")).toHaveCount(0);
  await explore(page, "rock_shelter");
  // hovering a place: icons for what you have found there
  await tab(page, "the beach").hover();
  await expect(page.locator("#mapTip")).toBeVisible();
  await expect(page.locator("#mapTip .map-icon-name")).toHaveText(["shelter"]);
  await tab(page, "the forest").hover();
  await expect(page.locator("#mapTip .map-icon-name")).toHaveText(["wood"]);
  await page.mouse.move(0, 0);
  await expect(page.locator("#mapTip")).toBeHidden();
  await expect(page.locator("#buildTab")).toBeVisible();
  // an explored landmark is not offered again
  await action(page, "look around").click();
  await expect(page.locator('#eventChoices [data-choice="rock_shelter"]')).toHaveCount(0);
  await page.locator("#eventBack").click();

  // forest: wood can be collected at once; the sound of water leads to the spring
  await tab(page, "the forest").click();
  await expect(tab(page, "the forest")).toHaveClass(/here/);
  await expect(async () => centred("the forest")).toPass(); // the map slides to the forest
  await action(page, "collect wood").click();
  await action(page, "collect wood").click();
  await explore(page, "spring");
  await expect(action(page, "look around")).not.toContainText("*"); // nothing left in the forest
  await action(page, "drink water").click();
  await expect(page.locator("#inventory")).toContainText("firewood");
  // still day 1: the night task stays active
  await expect(page.locator('#quests .quest[data-id="survive_first_night"]')).not.toHaveClass(/done/);

  await tab(page, "the beach").click();
  await expect(tab(page, "the beach")).toHaveClass(/here/);
  // raw food gets a fire icon only once the fire is lit
  // a box of matches, so "light fire" is the quick, sure kind (without them it is 2 h of friction and can fail)
  await page.evaluate(() => {
    const ti = (window as unknown as { ti: { give(i: string, n: number): void } }).ti;
    ti.give("raw_fish", 1);
    ti.give("matches", 10);
    ti.give("stone", 2);
  });
  const cook = page.locator('#buildings .control-row[data-id="campfire"] .btn', { hasText: "cook raw fish" });
  await expect(cook).toHaveCount(0);
  await create(page, "build", "campfire");
  await action(page, "light fire").click();
  await expect(page.locator("#log")).toContainText("The fire takes");
  await expect(action(page, "stoke fire")).toBeVisible();
  await expect(action(page, "sleep")).toHaveCount(0);
  await expect(cook).toBeVisible();
  await cook.click();
  await expect(page.locator('#consumables .control-row[data-id="cooked_fish"]')).toBeVisible();
});

test("finding fish starts a goal while the spear still requires personal rock knife completion", async ({ page }) => {
  for (let i = 0; i < 4; i++) await explore(page);
  const quest = page.locator('#quests .quest[data-id="first_catch"]');
  await expect(quest.locator(".title")).toHaveText("catch a fish");
  await expect(quest.locator("button, .needs, .progress, .tip")).toHaveCount(0);
  await page.locator("#craftTab").click();
  const spear = node(page, "craft", "craft_spear");
  await expect(spear.locator(".btn")).toHaveAttribute("aria-disabled", "true");
  await spear.locator(".tree-info").click();
  await expect(tooltip(page)).toContainText("personally craft rock knife");
  await page.evaluate(() => {
    const ti = (window as unknown as { ti: { give(i: string, n: number): void } }).ti;
    ti.give("stone", 2); ti.give("firewood", 10);
  });
  await create(page, "craft", "craft_rock_knife");
  await dismissProvisionWarning(page);
  await create(page, "craft", "craft_spear");
  await expect(page.locator("#inventory")).toContainText("fishing spear");
  await expect(action(page, "catch fish")).not.toHaveClass(/off/);
  await page.locator("#craftTab").click();
  await expect(spear).toHaveClass(/completed/);
  await expect(spear.locator(".btn")).toHaveAttribute("aria-disabled", "true");
});

test("without the knife a personal rock knife unlocks a spear that takes twice as long", async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await escapeShip(page, "matches");
  for (let i = 0; i < 4; i++) await explore(page);
  await page.evaluate(() => (window as unknown as { ti: { give(i: string, n: number): void } }).ti.give("firewood", 10));
  await action(page, "pick up stones").click();
  await page.locator("#craftTab").click();
  const knife = node(page, "craft", "craft_rock_knife");
  await knife.locator(".tree-info").click();
  await expect(tooltip(page)).toContainText("3h");
  await expect(tooltip(page)).toContainText("2 required");
  await create(page, "craft", "craft_rock_knife");
  await dismissProvisionWarning(page);
  await page.locator("#craftTab").click();
  await expect(knife).toHaveClass(/completed/);
  await expect(knife.locator(".btn")).toHaveAttribute("aria-disabled", "true");
  const spear = node(page, "craft", "craft_spear");
  await spear.locator(".tree-info").click();
  await expect(tooltip(page)).toContainText("1h");
  await create(page, "craft", "craft_spear");
  await expect(page.locator("#inventory")).toContainText("fishing spear");
});

test("while an action runs, the controls are locked and greyed out", async ({ page }) => {
  await page.goto("./?variants=first"); // normal speed
  await explore(page, "forest_edge"); // the way to the forest
  await tab(page, "the forest").click(); // walking: 30 game minutes takes 5 real seconds
  await expect(page.locator("#wrap")).toHaveClass(/busy/);
  // Bars interpolate each 15-minute clock step within the full action.
  await expect(page.locator('#tabs .tab[data-id="forest"] .cd')).toHaveCSS("transition-duration", "2.5s");
  await expect(page.locator("#wrap")).not.toHaveClass(/busy/, { timeout: 6_000 });
  await expect(tab(page, "the forest")).toHaveClass(/here/);
  await action(page, "collect wood").click(); // 30 min, with a progress bar
  await expect(action(page, "collect wood").locator(".cd")).toHaveCSS("transition-duration", "2.5s");
  await expect(page.locator("#wrap")).toHaveClass(/busy/);
  await expect(page.locator("#wrap")).toHaveAttribute("aria-busy", "true");
  // the other place is greyed out and does nothing
  await expect(tab(page, "the beach")).toBeDisabled();
  // a second click on collect wood meanwhile is ignored
  await action(page, "collect wood").dispatchEvent("click");
  await page.waitForTimeout(300);
  await expect(page.locator("#wrap")).toHaveClass(/busy/); // still running
  await expect(page.locator("#wrap")).not.toHaveClass(/busy/, { timeout: 6_000 });
  const firewood = await page.evaluate(() =>
    (window as unknown as { ti: { state(): { items: Record<string, number> } } }).ti.state().items.firewood ?? 0);
  expect(firewood).toBeGreaterThanOrEqual(3);
  expect(firewood).toBeLessThanOrEqual(5); // one armful (3 to 5), not two
});

test("the clock ticks by quarters while work runs, with crafted items and buildings delivered at the end", async ({ page }) => {
  for (let i = 0; i < 4; i++) await explore(page);
  await page.evaluate(() => {
    const ti = (window as unknown as { ti: { give(i: string, n: number): void } }).ti;
    ti.give("stone", 4);
  });
  await create(page, "craft", "craft_rock_knife");
  await dismissProvisionWarning(page);
  await create(page, "build", "campfire");
  await page.goto("./?variants=first");
  await page.evaluate(() => {
    const ti = (window as unknown as { ti: { give(i: string, n: number): void; stat(s: string, v: number): void } }).ti;
    ti.give("firewood", 14);
    ti.give("timber", 2);
    ti.stat("hunger", 0);
    ti.stat("thirst", 0);
    ti.stat("energy", 100);
  });
  const state = () => page.evaluate(() =>
    (window as unknown as { ti: { state(): { time: number; location: string; items: Record<string, number>; buildings: Record<string, unknown> } } }).ti.state());
  const start = (await state()).time;
  const wallTime = new Date("2030-01-01T06:00:00Z");
  await page.clock.install({ time: wallTime });
  await page.clock.pauseAt(wallTime);
  await page.locator("#craftTab").dispatchEvent("click");
  await node(page, "craft", "craft_spear").locator(".btn").dispatchEvent("click");
  await expect(node(page, "craft", "craft_spear").locator(".cd")).toHaveCSS("transition-duration", "2.5s");
  await page.locator("#buildTab").dispatchEvent("click");
  await page.locator("#areaTab").dispatchEvent("click");
  await expect(page.locator("#workBox")).toBeVisible();
  await page.locator("#craftTab").dispatchEvent("click");
  const busyInfo = node(page, "craft", "craft_spear").locator(".tree-info");
  await busyInfo.focus();
  await expect(tooltip(page)).toBeVisible();
  await busyInfo.evaluate((el) => { (el as HTMLElement).dataset.testIdentity = "preserved"; });
  await node(page, "craft", "craft_spear").locator(".btn").dispatchEvent("click");
  expect((await state()).time).toBe(start);
  await expect(page.locator("#wrap")).toHaveClass(/busy/);
  await expect(page.locator('#inventory [data-id="fishing_spear"]')).toHaveCount(0);
  await page.clock.runFor(2_499);
  expect((await state()).time).toBe(start);
  await page.clock.runFor(1);
  expect((await state()).time).toBe(start + 15);
  await expect(busyInfo).toBeFocused();
  await expect(busyInfo).toHaveAttribute("data-test-identity", "preserved");
  await expect(tooltip(page)).toBeVisible();
  await page.locator("#areaTab").dispatchEvent("click");
  await expect(tooltip(page)).toBeHidden();
  const clock = (time: number) => `${String(Math.floor(time / 60) % 24).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`;
  await expect(page.locator("#clock")).toContainText(clock(start + 15));
  await expect(page.locator('#inventory [data-id="fishing_spear"]')).toHaveCount(0);
  await page.clock.runFor(2_500);
  expect((await state()).time).toBe(start + 30);
  await expect(page.locator('#inventory [data-id="fishing_spear"]')).toBeVisible();
  await expect(page.locator("#wrap")).not.toHaveClass(/busy/);

  await page.locator("#buildTab").dispatchEvent("click");
  await node(page, "build", "bed").locator(".btn").dispatchEvent("click");
  await page.locator("#areaTab").dispatchEvent("click");
  await expect(page.locator('#buildings [data-id="bed"]')).toHaveCount(0);
  await expect(page.locator("#event")).toBeHidden();
  await page.clock.runFor(7_500);
  expect((await state()).time).toBe(start + 75);
  expect((await state()).buildings["bed@beach"]).toBeUndefined();
  await expect(page.locator('#buildings [data-id="bed"]')).toHaveCount(0);
  await page.clock.runFor(2_500);
  expect((await state()).time).toBe(start + 90);
  await expect(page.locator('#buildings [data-id="bed"]')).toBeVisible();
  await expect(page.locator("#eventTitle")).toHaveText("Task done: make a bed");
  await page.locator("#eventBack").dispatchEvent("click");
  await expect(page.locator("#quests .needs, #quests .progress, #quests .tip")).toHaveCount(0);

  await expect(page.locator("#regionTitle")).toHaveText("A Grey Beach");
  await tab(page, "the forest").dispatchEvent("click");
  expect((await state()).location).toBe("beach");
  await page.clock.runFor(2_500);
  expect((await state()).time).toBe(start + 105);
  expect((await state()).location).toBe("beach");
  await expect(page.locator("#regionTitle")).toHaveText("A Grey Beach");
  await page.clock.runFor(2_500);
  expect((await state()).time).toBe(start + 120);
  expect((await state()).location).toBe("forest");
  await expect(page.locator("#regionTitle")).toHaveText("A Quiet Forest");
  // Reloading unfinished work resumes its saved progress without awarding results early.
  await action(page, "collect wood").dispatchEvent("click");
  await page.clock.runFor(2_500);
  expect((await state()).time).toBe(start + 135);
  await page.reload();
  expect((await state()).time).toBe(start + 135);
  expect((await state()).items.firewood ?? 0).toBe(0);
  await expect(page.locator("#wrap")).toHaveClass(/busy/);
  await page.clock.runFor(2_500);
  expect((await state()).time).toBe(start + 150);
  expect((await state()).items.firewood).toBeGreaterThan(0);
  await expect(page.locator("#wrap")).not.toHaveClass(/busy/);
  const beforePause = (await state()).time;
  await action(page, "collect wood").dispatchEvent("click");
  await page.clock.runFor(2_500);
  await page.locator("#work .btn", { hasText: "pause" }).click();
  await expect(page.locator("#wrap")).not.toHaveClass(/busy/);
  await page.clock.runFor(10_000);
  expect((await state()).time).toBe(beforePause + 15);
  await page.reload();
  await expect(page.locator("#work .btn", { hasText: "resume" })).toBeVisible();
  expect((await state()).time).toBe(beforePause + 15);
  await page.locator("#work .btn", { hasText: "resume" }).click();
  await page.clock.runFor(2_500);
  expect((await state()).time).toBe(beforePause + 30);
  await expect(page.locator("#workBox")).toBeHidden();
});

test("classic shows all panels, ignores retired layout preferences, and remembers fonts", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("textisland.layout", 'notebook'));
  await page.goto("./?speed=0.01&variants=first&layout=journal");
  await expect(page.locator("#app")).toHaveClass("layout-classic");
  await expect(page.locator("#layoutBtn, #layoutMenu")).toHaveCount(0);
  await expect(page.locator(".action-sections > fieldset > legend")).toHaveText(["buildings", "consumables"]);
  await expect(page.locator("#inventory button")).toHaveCount(0);
  await expect(page.locator("#areaActions legend")).toHaveCount(0);
  await expect(page.locator('#inventory .row[data-id="knife"]')).toBeVisible();
  await expect(page.locator("#consumablesBox")).toBeHidden();
  await expect(page.locator("#status .row")).toHaveCount(5);
  await expect(page.locator("#quests .quest .title")).toHaveText(["survive the first night"]);
  await expect(page.locator("#inventory .row .key")).toHaveText(["knife", "summer clothes"]);
  for (let i = 0; i < 4; i++) await explore(page);
  await expect(page.locator("#log")).toContainText("a school of small fish");

  const fontOf = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontFamily);
  await expect(page.locator("#fontBtn")).toHaveText("font: times.");
  await page.locator("#fontBtn").click();
  await page.locator('#fontMenu [data-font="garamond_italic"]').click();
  await expect(page.locator("#fontBtn")).toHaveText("font: garamond italic.");
  for (const sel of ["#log .entry", "#actions .btn", "#status .key", "#fontBtn", "#clock", "#tabs .tab"]) {
    expect(await fontOf(sel), sel).toContain("Cormorant Garamond");
  }
  await expect(page.locator("#log .entry").first()).toHaveCSS("font-style", "italic");
  await page.reload();
  await expect(page.locator("#app")).toHaveClass("layout-classic");
  await expect(page.locator("#fontBtn")).toHaveText("font: garamond italic.");
  await expect(page.locator("#log")).toContainText("a school of small fish");
});

test("central sections keep local building controls and portable item controls usable on desktop and phone", async ({ page }) => {
  await explore(page, "forest_edge");
  await explore(page, "rock_shelter");
  await page.evaluate(() => {
    const ti = (window as unknown as { ti: { give(i: string, n: number): void } }).ti;
    for (const [id, n] of Object.entries({ timber: 2, firewood: 7, stone: 2, matches: 1, raw_fish: 1, cooked_fish: 1, can_water: 1, water_can: 1 })) ti.give(id, n);
  });
  await expect(page.locator("#buildingsBox")).toBeHidden();
  await expect(page.locator("#consumablesBox")).toBeVisible();
  const main = page.locator("#actions .btn");
  await expect(main.locator(".label").filter({ hasText: /look around/ })).toHaveText([/look around/]);
  await expect(page.getByRole("tab")).toHaveText(["area", "crafting", "building"]);
  await create(page, "build", "campfire");
  await create(page, "build", "bed");
  await expect(page.locator("#buildingsBox")).toBeVisible();
  await page.locator("#eventBack").click();
  await action(page, "light fire").click();
  await expect(page.locator("#wrap")).not.toHaveClass(/busy/);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator(".action-sections > fieldset > legend")).toHaveText(["buildings", "consumables"]);
  await expect(page.locator('#buildings .control-row[data-id="bed"] .btn .label')).toHaveText("sleep");
  await expect(page.locator('#buildings .control-row[data-id="campfire"] .btn .label')).toHaveText(["stoke fire", "cook raw fish"]);
  await expect(page.locator("#inventory button")).toHaveCount(0);
  await expect(page.locator("#areaActions legend")).toHaveCount(0);
  await expect(page.locator("#actions .btn").filter({ hasText: /look around|craft|build/ }).first()).toContainText("look around");
  await page.setViewportSize({ width: 375, height: 667 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const cook = page.locator('#buildings .control-row[data-id="campfire"] .btn', { hasText: "cook raw fish" });
  await cook.scrollIntoViewIfNeeded();
  const box = (await cook.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(box.height).toBeGreaterThanOrEqual(40);
  await page.locator('#consumables .control-row[data-id="cooked_fish"] .btn').click();
  await expect(page.locator('#consumables .control-row[data-id="cooked_fish"]')).toHaveCount(0);
  await page.locator('#consumables .control-row[data-id="can_water"] .btn').click();
  await expect(page.locator('#consumables .control-row[data-id="can_water"]')).toHaveCount(0);
  await tab(page, "the forest").click();
  await expect(page.locator("#buildings .control-row")).toHaveCount(0);
  await expect(page.locator("#buildingsBox")).toBeHidden();
  await explore(page, "spring");
  await page.locator('#consumables .control-row[data-id="water_can"] .btn').click();
  await expect(page.locator('#consumables .control-row[data-id="can_water"] .val')).toHaveText("4");
});

test("on a phone screen classic fits the width, and its buttons are on screen and usable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.evaluate(() => localStorage.clear());
  await page.goto("./?speed=0.01&variants=first");
  const panel = (await page.locator("#event .panel").boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(375);
  const last = (await page.locator("#eventChoices .btn").last().boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(667);
  await escapeShip(page, "knife");
  const look = action(page, "look around");
  await expect(look).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const box = (await look.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(667);
  expect(box.height).toBeGreaterThanOrEqual(40);
  const topmost = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest(".btn")?.textContent ?? null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(topmost).toContain("look around");
  await explore(page, "forest_edge");
  await expect(tab(page, "the forest")).toBeVisible();
  // Font choices remain available as a sheet within the phone screen.
  await page.locator("#fontBtn").click();
  const sheet = (await page.locator("#fontMenu").boundingBox())!;
  expect(sheet.x).toBeGreaterThanOrEqual(0);
  expect(sheet.x + sheet.width).toBeLessThanOrEqual(375);
  await page.locator('#fontMenu [data-font="times"]').click();
  await expect(page.locator("#fontMenu")).toBeHidden();
});

test("death is permanent: the end screen tells your story; load the saved game or start again", async ({ page }) => {
  const ti = () => page.evaluate(() => {
    const t = (window as unknown as { ti: { stat(s: string, v: number): void } }).ti;
    t.stat("health", 0);
    t.stat("hunger", 100);
  });
  const dieExploring = async () => {
    await ti();
    await action(page, "look around").click();
    await page.locator('#eventChoices .btn:not([data-choice="close"])').first().click(); // health is already zero; the next simulation step ends the game
  };
  // save first
  await page.locator("#saveBtn").click();
  await expect(page.locator("#saveBtn")).toHaveText("saved.");

  await dieExploring();
  await expect(page.locator("#fade")).toBeVisible();
  await expect(page.locator("#fadeText")).toHaveText("The world fades.");
  const end = page.locator("#end");
  await expect(end).toBeVisible({ timeout: 6_000 });
  await expect(page.locator("#endTitle")).toHaveText("The journal ends");
  await expect(page.locator("#endText")).toContainText("Cause of death: your injuries.");
  await expect(page.locator("#endText p")).toHaveCount(2); // how long, and why: nothing more
  await expect(page.locator("#endText")).toContainText(/You lasted .* on the island, until day 1\./);
  await expect(page.locator("#game")).toBeHidden();

  // a reload keeps the end: death is permanent
  await page.reload();
  await expect(end).toBeVisible();

  // load the saved game: back to before the death
  await page.locator("#endLoad").click();
  await expect(end).toBeHidden();
  await expect(action(page, "look around")).toBeVisible();
  await expect(tab(page, "the forest")).toHaveCount(0); // nothing explored yet in the saved game

  // die again, and start a new game this time
  await dieExploring();
  await expect(end).toBeVisible({ timeout: 6_000 });
  await page.locator("#endRestart").click();
  await expect(end).toBeHidden();
  await expect(page.locator("#eventTitle")).toHaveText("The storm");
});



test("compact trees keep all nodes readable and hints inspectable on desktop and narrow phones", async ({ page }) => {
  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 800 });
    for (const kind of ["build", "craft"] as const) {
      await page.locator(`#${kind}Tab`).click();
      const tree = page.locator(`#${kind}Tree`);
      const cards = tree.locator(".tree-node");
      await expect(cards).toHaveCount(kind === "build" ? 10 : 5);
      await expect(tree.locator(".tree-edges path")).toHaveCount(kind === "build" ? 9 : 4);
      await expect(tree.locator("h3, details, .node-state, .node-parents")).toHaveCount(0);
      const scroller = page.locator(`#${kind}Panel.tree-scroll`);
      if (width <= 600) expect(await scroller.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0);
      expect(await scroller.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(width);
      for (const path of await tree.locator(".tree-edges path").all()) {
        expect(await path.getAttribute("d")).not.toMatch(/[CQAS]/i);
      }
      const boxes = await cards.evaluateAll((els) => els.map((el) => {
        const box = el.getBoundingClientRect();
        return { x: box.x, y: box.y, right: box.right, bottom: box.bottom };
      }));
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        expect(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y).toBe(true);
      }
      // Connections must not suggest false dependencies by crossing unrelated chips.
      const crossings = await tree.evaluate((el) => {
        const chips = [...el.querySelectorAll<HTMLElement>(".tree-node")].map((chip) => ({
          id: chip.dataset.target, rect: chip.getBoundingClientRect(),
        }));
        const intersections: string[] = [];
        for (const path of el.querySelectorAll<SVGPathElement>(".tree-edges path")) {
          const matrix = path.getScreenCTM()!;
          const length = path.getTotalLength();
          for (let distance = 1; distance < length; distance += 2) {
            const point = path.getPointAtLength(distance).matrixTransform(matrix);
            const chip = chips.find(({ rect }) => point.x > rect.left + 1 && point.x < rect.right - 1
              && point.y > rect.top + 1 && point.y < rect.bottom - 1);
            if (chip) { intersections.push(`${path.dataset.parent} to ${path.dataset.target} crosses ${chip.id}`); break; }
          }
        }
        return intersections;
      });
      expect(crossings).toEqual([]);
      // Siblings never wrap: each complete predecessor group shares one row and
      // stays centred on its parents, independent of content IDs or canvas overflow.
      const misaligned = await tree.evaluate((el) => {
        const chips = new Map([...el.querySelectorAll<HTMLElement>(".tree-node")].map((chip) => [chip.dataset.target!, chip.getBoundingClientRect()]));
        const parents = new Map<string, string[]>();
        for (const edge of el.querySelectorAll<SVGPathElement>(".tree-edges path")) {
          const ids = parents.get(edge.dataset.target!) ?? [];
          ids.push(edge.dataset.parent!); parents.set(edge.dataset.target!, ids);
        }
        const rows = new Map<string, { parents: string[]; ids: string[] }>();
        for (const [id, ids] of parents) {
          const key = [...ids].sort().join(",");
          const row = rows.get(key) ?? { parents: ids, ids: [] };
          row.ids.push(id); rows.set(key, row);
        }
        const failures: string[] = [];
        for (const row of rows.values()) {
          const expected = row.parents.reduce((sum, id) => {
            const rect = chips.get(id)!; return sum + (rect.left + rect.right) / 2;
          }, 0) / row.parents.length;
          const rects = row.ids.map((id) => chips.get(id)!);
          if (Math.max(...rects.map((r) => r.top)) - Math.min(...rects.map((r) => r.top)) > 1) failures.push(`${row.ids.join(",")} wrapped`);
          const actual = (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2;
          if (Math.abs(actual - expected) > 1) failures.push(`${row.ids.join(",")} offset ${actual - expected}`);
        }
        return failures;
      });
      expect(misaligned).toEqual([]);
      await page.screenshot({ path: `test-results/compact-tree-${kind}-${width}-clean.png`, fullPage: false, animations: "disabled" });
      if (kind === "build" && width === 1280) {
        // Inspect a static clone of the whole canvas without resizing the live game or its scroll state.
        await tree.evaluate((el) => {
          const capture = document.createElement("div");
          capture.id = "treeCanvasCapture"; capture.className = "layout-classic";
          Object.assign(capture.style, { position: "fixed", left: "0", top: "0", zIndex: "9999", background: "var(--bg)", width: `${el.clientWidth}px`, height: `${el.clientHeight}px` });
          capture.append(el.cloneNode(true)); document.body.append(capture);
        });
        await page.locator("#treeCanvasCapture").screenshot({ path: "test-results/compact-tree-build-full-canvas.png", animations: "disabled" });
        await page.locator("#treeCanvasCapture").evaluate((el) => el.remove());
      }
      const target = kind === "build" ? "bed" : "craft_spear";
      const chip = node(page, kind, target);
      const button = chip.locator(".btn");
      for (const control of [button, chip.locator(".tree-info")]) {
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(38);
      }
      await button.focus();
      await expect(button).toBeFocused();
      await expect(button).toHaveAttribute("aria-disabled", "true");
      await expect(tooltip(page)).toBeVisible();
      await button.press("Enter");
      await expect(page.locator("#workBox")).toBeHidden();
      await page.keyboard.press("Escape");
      await expect(tooltip(page)).toBeHidden();
      await chip.locator(".tree-info").click();
      await expect(tooltip(page)).toBeVisible();
      // Focus and layout can produce a late scroll event after inspection opens.
      // It must not dismiss an explicitly pinned hint before it can be read.
      await scroller.evaluate((el) => el.dispatchEvent(new Event("scroll")));
      await expect(tooltip(page)).toBeVisible();
      await expect(tooltip(page).locator(".tree-category")).not.toBeEmpty();
      await expect(tooltip(page)).toContainText(kind === "build" ? "personally build campfire" : "personally craft rock knife");
      const tipBox = (await tooltip(page).boundingBox())!;
      expect(tipBox.x).toBeGreaterThanOrEqual(0);
      expect(tipBox.y).toBeGreaterThanOrEqual(0);
      expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(width);
      expect(tipBox.y + tipBox.height).toBeLessThanOrEqual(800);
      await page.screenshot({ path: `test-results/compact-tree-${kind}-${width}.png`, fullPage: false, animations: "disabled" });
      await expect(button).toHaveCSS("color", await page.locator("body").evaluate((el) => getComputedStyle(el).color));
      await expect(button).toHaveCSS("opacity", "1");
      await page.locator("#clock").click();
      await expect(tooltip(page)).toBeHidden();
      await chip.locator(".tree-info").click();
      await page.locator("#areaTab").click();
      await expect(tooltip(page)).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    }
  }
});

test("compact tree inspection preserves both scroll axes and stays inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 320 });
  await page.locator("#buildTab").click();
  const scroller = page.locator("#buildPanel.tree-scroll");
  expect(await scroller.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0);
  expect(await scroller.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0);
  await scroller.evaluate((el) => { el.scrollLeft = 0; el.scrollTop = 0; });
  await scroller.hover();
  await page.mouse.wheel(150, 150);
  await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const info = node(page, "build", "bee_hive").locator(".tree-info");
  await info.scrollIntoViewIfNeeded();
  await info.click();
  await expect(tooltip(page)).toBeVisible();
  const before = await scroller.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }));
  expect(before.x).toBeGreaterThan(0);
  expect(before.y).toBeGreaterThan(0);
  await page.evaluate(() => (window as unknown as { ti: { give(i: string, n: number): void } }).ti.give("stone", 1));
  await expect(tooltip(page)).toBeFocused();
  expect(await scroller.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }))).toEqual(before);
  const box = (await tooltip(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(box.y + box.height).toBeLessThanOrEqual(320);
  // Opening a real blocking popup must clear inspection, including an anchor in a visible tree.
  await action(page, "look around").dispatchEvent("click");
  await expect(page.locator("#event")).toBeVisible();
  await expect(tooltip(page)).toBeHidden();
  await page.locator("#eventBack").click();
  await expect(tooltip(page)).toBeHidden();
});

for (const kind of ["craft", "build"] as const) {
  test(`${kind} tree drags pan without activating ready nodes and small movement still clicks`, async ({ page }) => {
    await explore(page, "rock_shelter");
    if (kind === "craft") await explore(page, "cliff_shells");
    await page.evaluate(() => {
      const ti = (window as unknown as { ti: { give(i: string, n: number): void; stat(s: string, v: number): void } }).ti;
      ti.give("stone", 20); ti.stat("hunger", 0); ti.stat("thirst", 0);
    });
    await page.setViewportSize({ width: 320, height: 250 });
    await page.locator(`#${kind}Tab`).click();
    const scroller = page.locator(`#${kind}Panel.tree-scroll`);
    const button = node(page, kind, kind === "craft" ? "craft_rock_knife" : "campfire").locator(".btn");
    await button.scrollIntoViewIfNeeded();
    await expect(button).toHaveAttribute("aria-disabled", "false");
    await expect(scroller).toHaveCSS("scrollbar-width", "none");
    expect(await scroller.evaluate((el) => getComputedStyle(el, "::-webkit-scrollbar").display)).toBe("none");
    const before = await scroller.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }));
    const state = () => page.evaluate(() => (window as unknown as { ti: { state(): { actions: unknown[]; items: Record<string, number> } } }).ti.state());
    const materials = (await state()).items.stone;
    let box = (await button.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 55, box.y + box.height / 2 - 50, { steps: 8 });
    await expect(scroller).toHaveClass(/tree-panning/);
    await expect(scroller).toHaveCSS("cursor", "grabbing");
    await expect(tooltip(page)).toBeHidden();
    await page.mouse.up();
    await expect(scroller).not.toHaveClass(/tree-panning/);
    await expect(scroller).toHaveCSS("cursor", "grab");
    const after = await scroller.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }));
    expect(after.x).toBeGreaterThan(before.x);
    expect(after.y).toBeGreaterThan(before.y);
    expect((await state()).actions).toEqual([]);
    expect((await state()).items.stone).toBe(materials);
    await expect(tooltip(page)).toBeHidden();
    await page.evaluate(() => (window as unknown as { ti: { stat(s: string, v: number): void } }).ti.stat("thirst", 0));
    expect(await scroller.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }))).toEqual(after);

    // Dragging the separate inspection control must not pin its tooltip on release.
    const info = node(page, kind, kind === "craft" ? "craft_rock_knife" : "campfire").locator(".tree-info");
    await info.scrollIntoViewIfNeeded();
    box = (await info.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 20, box.y + box.height / 2 - 20, { steps: 4 });
    await expect(scroller).toHaveClass(/tree-panning/);
    await page.mouse.up();
    await expect(tooltip(page)).toBeHidden();
    expect((await state()).items.stone).toBe(materials);

    // Capture must end even when the release happens outside the tree viewport.
    await button.scrollIntoViewIfNeeded();
    box = (await button.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(1, 1, { steps: 8 });
    await expect(scroller).toHaveClass(/tree-panning/);
    await page.mouse.up();
    await expect(scroller).not.toHaveClass(/tree-panning/);
    expect((await state()).items.stone).toBe(materials);

    // Browser pointer cancellation resets the gesture and does not turn it into a click.
    await button.scrollIntoViewIfNeeded();
    await scroller.evaluate((el) => el.addEventListener("pointerdown", (event) => {
      (el as HTMLElement).dataset.testPointer = String((event as PointerEvent).pointerId);
    }, { once: true }));
    box = (await button.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 20, box.y + box.height / 2 - 20, { steps: 4 });
    await expect(scroller).toHaveClass(/tree-panning/);
    await scroller.evaluate((el) => el.dispatchEvent(new PointerEvent("pointercancel", {
      bubbles: true, pointerId: Number((el as HTMLElement).dataset.testPointer), pointerType: "mouse",
    })));
    await expect(scroller).not.toHaveClass(/tree-panning/);
    await expect(scroller).toHaveCSS("cursor", "grab");
    await page.mouse.up();
    expect((await state()).items.stone).toBe(materials);

    // Keyboard scrolling remains native, and a movement below the threshold still creates normally.
    await scroller.evaluate((el) => { el.scrollTop = 0; });
    await button.focus();
    await button.press("ArrowDown");
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await button.scrollIntoViewIfNeeded();
    box = (await button.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2 + 1);
    await page.mouse.up();
    await expect.poll(async () => (await state()).items.stone).toBe(materials - 2);
    await expect(page.locator("#wrap")).not.toHaveClass(/busy/, { timeout: 20_000 });
    // The completed root unlocks its actual child; keyboard activation still uses the same pipeline.
    await dismissProvisionWarning(page);
    await page.evaluate(() => {
      const ti = (window as unknown as { ti: { give(i: string, n: number): void } }).ti;
      ti.give("firewood", 4); ti.give("timber", 2);
    });
    const child = node(page, kind, kind === "craft" ? "craft_axe" : "bed").locator(".btn");
    await child.focus();
    await expect(child).toHaveAttribute("aria-disabled", "false");
    await child.press("Enter");
    await expect.poll(async () => (await state()).items.firewood).toBe(kind === "craft" ? 2 : 0);
    await expect(page.locator("#wrap")).not.toHaveClass(/busy/, { timeout: 20_000 });
  });
}

test("touch swipes keep native tree scrolling without activating a ready node", async ({ page }) => {
  await explore(page, "rock_shelter");
  await page.evaluate(() => (window as unknown as { ti: { give(i: string, n: number): void } }).ti.give("stone", 2));
  await page.setViewportSize({ width: 320, height: 250 });
  await page.locator("#buildTab").click();
  const scroller = page.locator("#buildPanel.tree-scroll");
  const button = node(page, "build", "campfire").locator(".btn");
  await button.scrollIntoViewIfNeeded();
  await expect(button).toHaveAttribute("aria-disabled", "false");
  const before = await scroller.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }));
  const box = (await button.boundingBox())!;
  const touch = await page.context().newCDPSession(page);
  await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
  for (let step = 1; step <= 8; step++) await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove", touchPoints: [{ x: start.x - step * 7, y: start.y - step * 6 }],
  });
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before.x);
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(before.y);
  await expect(scroller).not.toHaveClass(/tree-panning/);
  const state = await page.evaluate(() => (window as unknown as { ti: { state(): { actions: unknown[]; items: Record<string, number> } } }).ti.state());
  expect(state.actions).toEqual([]);
  expect(state.items.stone).toBe(2);
});

test("a pinned tall tree tooltip scrolls its full requirements without dismissing", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 220 });
  await page.locator("#buildTab").click();
  const info = node(page, "build", "bed").locator(".tree-info");
  await info.scrollIntoViewIfNeeded();
  await info.click();
  const tip = tooltip(page);
  await expect(tip).toBeVisible();
  expect(await tip.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0);
  await tip.hover();
  await page.mouse.wheel(0, 300);
  await expect.poll(() => tip.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(tip).toBeVisible();
  await tip.focus();
  await expect(tip).toBeFocused();
  await tip.press("Home");
  await expect.poll(() => tip.evaluate((el) => el.scrollTop)).toBe(0);
  await tip.press("End");
  await expect.poll(() => tip.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(tip).toBeVisible();
  await expect(page.locator("#workBox")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
  await expect(info).toBeFocused();
  // Closing the overlay may uncover its chip under a stationary pointer.
  await node(page, "build", "bed").dispatchEvent("pointerenter", { pointerType: "mouse" });
  await expect(tip).toBeHidden();
  await info.click();
  await expect(tip).toBeVisible();
  await page.locator("#buildTab").click();
  await expect(tip).toBeHidden();
});

test("an incompatible save stays intact until the player chooses a new game", async ({ page }) => {
  const old = JSON.stringify({ saveVersion: 6, current: { saveVersion: 6 } });
  await page.evaluate((raw) => localStorage.setItem("textisland.save", raw), old);
  await page.reload();
  await expect(page.locator("#app")).toContainText("This save predates crafting and building progression.");
  expect(await page.evaluate(() => localStorage.getItem("textisland.save"))).toBe(old);
  // The recovery screen deliberately reports the rejected save as a script error.
  for (let i = errors.length - 1; i >= 0; i--) if (errors[i].includes("This save predates crafting and building progression.")) errors.splice(i, 1);
  await page.getByRole("button", { name: "start a new game" }).click();
  await expect(page.locator("#eventTitle")).toHaveText("The storm");
});

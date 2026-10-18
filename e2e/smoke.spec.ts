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
  await action(page, "build").click();
  await expect(page.locator('#eventChoices [data-choice="shelter"]')).toHaveCount(0);
  await page.locator('#eventChoices [data-choice="bed"]').click();
  await page.locator("#eventBack").click();
  await action(page, "build").click();
  await page.locator('#eventChoices [data-choice="campfire"]').click();
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
  await action(page, "build").click();
  await page.locator('#eventChoices [data-choice="drying_rack"]').click();
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
  // Main activities share a row in every area.
  const y = async (name: string) => (await action(page, name).boundingBox())!.y;
  expect(await y("build")).toBe(await y("look around"));
  expect(await y("craft")).toBe(await y("build"));
  // the river starts the fish trap task: 20 willow twigs; built from the build menu; then it is in the buildings panel
  const task = page.locator('#quests .quest[data-id="build_fish_trap"]');
  await expect(task).toBeVisible();
  await action(page, "cut willow twigs").click();
  await action(page, "cut willow twigs").click();
  await expect(task.locator(".progress")).toHaveCount(0);
  await action(page, "build").click();
  await expect(page.locator("#eventTitle")).toHaveText("Build");
  await page.locator('#eventChoices [data-choice="fish_trap"]').click();
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
  await expect(action(page, "build")).toBeVisible();
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
  await action(page, "build").click();
  await page.locator('#eventChoices [data-choice="campfire"]').click();
  await action(page, "light fire").click();
  await expect(page.locator("#log")).toContainText("The fire takes");
  await expect(action(page, "stoke fire")).toBeVisible();
  await expect(action(page, "sleep")).toHaveCount(0);
  await expect(cook).toBeVisible();
  await cook.click();
  await expect(page.locator('#consumables .control-row[data-id="cooked_fish"]')).toBeVisible();
});

test("finding the fish starts 'catch a fish' (it needs a spear or a trap); the spear comes from the craft menu", async ({ page }) => {
  for (let i = 0; i < 4; i++) await explore(page); // dunes, rocks, cliff, shallows
  const quest = page.locator('#quests .quest[data-id="first_catch"]');
  await expect(quest.locator(".title")).toHaveText("catch a fish");
  await expect(quest.locator("button")).toHaveCount(0); // tasks have no buttons
  await expect(quest.locator(".needs, .progress, .tip")).toHaveCount(0);
  // the craft menu: a pop-up with the spear, what it needs in its tooltip
  await action(page, "craft").click();
  await expect(page.locator("#eventTitle")).toHaveText("Craft");
  const spear = page.locator('#eventChoices [data-choice="craft_spear"]');
  await expect(spear).toHaveClass(/off/);
  await expect(spear).toHaveAttribute("title", "10 firewood · 30m: Needs 10 firewood (have 0)");
  await page.locator("#eventBack").click();

  await page.evaluate(() => (window as unknown as { ti: { give(i: string, n: number): void } }).ti.give("firewood", 10));
  await expect(action(page, "craft").locator(".label")).toHaveText("craft*"); // something can be made now
  await action(page, "craft").click();
  await spear.click();
  await expect(page.locator("#event")).toBeHidden(); // the menu closes; no task is done by crafting
  await expect(page.locator("#inventory")).toContainText("fishing spear");
  await expect(quest.locator(".needs, .progress, .tip")).toHaveCount(0);
  await expect(action(page, "catch fish")).not.toHaveClass(/off/);
  await expect(action(page, "craft").locator(".label")).toHaveText("craft"); // no *: one spear is enough
});

test("without the knife: a rock knife first (2 stones, 3 hours), then the spear takes twice as long", async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await escapeShip(page, "matches");
  for (let i = 0; i < 4; i++) await explore(page); // dunes, rocks, cliff, shallows
  await page.evaluate(() => (window as unknown as { ti: { give(i: string, n: number): void } }).ti.give("firewood", 10));
  await action(page, "pick up stones").click(); // under the cliff: 2 or 3 stones
  await action(page, "craft").click();
  await expect(page.locator('#eventChoices [data-choice="craft_rock_knife"]')).toHaveText("rock knife3h");
  await expect(page.locator('#eventChoices [data-choice="craft_rock_knife"]')).toHaveAttribute("title", "2 stones · 3h");
  await expect(page.locator('#eventChoices [data-choice="craft_spear"]')).toHaveClass(/off/);
  await page.locator('#eventChoices [data-choice="craft_rock_knife"]').click();
  await expect(page.locator("#inventory")).toContainText("rock knife");
  await dismissProvisionWarning(page);
  await action(page, "craft").click();
  await expect(page.locator('#eventChoices [data-choice="craft_rock_knife"]')).toHaveCount(0);
  await expect(page.locator('#eventChoices [data-choice="craft_spear"]')).toHaveText("fishing spear1h");
  await page.locator('#eventChoices [data-choice="craft_spear"]').click();
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
  await action(page, "craft").dispatchEvent("click");
  await page.locator('#eventChoices [data-choice="craft_spear"]').dispatchEvent("click");
  expect((await state()).time).toBe(start);
  await expect(page.locator("#wrap")).toHaveClass(/busy/);
  await expect(page.locator('#inventory [data-id="fishing_spear"]')).toHaveCount(0);
  await page.clock.runFor(2_499);
  expect((await state()).time).toBe(start);
  await page.clock.runFor(1);
  expect((await state()).time).toBe(start + 15);
  const clock = (time: number) => `${String(Math.floor(time / 60) % 24).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`;
  await expect(page.locator("#clock")).toContainText(clock(start + 15));
  await expect(page.locator('#inventory [data-id="fishing_spear"]')).toHaveCount(0);
  await page.clock.runFor(2_500);
  expect((await state()).time).toBe(start + 30);
  await expect(page.locator('#inventory [data-id="fishing_spear"]')).toBeVisible();
  await expect(page.locator("#wrap")).not.toHaveClass(/busy/);

  await action(page, "build").dispatchEvent("click");
  await page.locator('#eventChoices [data-choice="bed"]').dispatchEvent("click");
  await expect(page.locator("#buildingsBox")).toBeHidden();
  await expect(page.locator("#event")).toBeHidden();
  await page.clock.runFor(7_500);
  expect((await state()).time).toBe(start + 75);
  expect((await state()).buildings["bed@beach"]).toBeUndefined();
  await expect(page.locator("#buildingsBox")).toBeHidden();
  await page.clock.runFor(2_500);
  expect((await state()).time).toBe(start + 90);
  await expect(page.locator('#buildings [data-id="bed"]')).toBeVisible();
  await expect(page.locator("#eventTitle")).toHaveText("Task done: make a bed");
  await page.locator("#eventBack").dispatchEvent("click");
  await expect(page.locator("#quests .needs, #quests .progress, #quests .tip")).toHaveCount(0);

  await tab(page, "the forest").dispatchEvent("click");
  expect((await state()).location).toBe("beach");
  await page.clock.runFor(2_500);
  expect((await state()).time).toBe(start + 105);
  expect((await state()).location).toBe("beach");
  await page.clock.runFor(2_500);
  expect((await state()).time).toBe(start + 120);
  expect((await state()).location).toBe("forest");
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

test("every layout can be chosen from the menu, shows all panels, plays, and is remembered", async ({ page }) => {
  const layouts = ["journal", "scene", "notebook", "bujo", "stage", "classic"];
  for (const [i, id] of layouts.entries()) {
    await page.locator("#layoutBtn").click();
    await expect(page.locator("#layoutMenu")).toBeVisible();
    await page.locator(`#layoutMenu [data-layout="${id}"]`).click();
    await expect(page.locator("#layoutMenu")).toBeHidden();
    await expect(page.locator("#layoutBtn")).toHaveText(`layout: ${id === "bujo" ? "old journal" : id}.`);
    await expect(page.locator("#app")).toHaveClass(new RegExp(`layout-${id}`));
    await expect(page.locator(".action-sections > fieldset > legend")).toHaveText(["buildings", "consumables"]);
    await expect(page.locator("#inventory button")).toHaveCount(0);
    await expect(page.locator("#areaActions legend")).toHaveCount(0);
    await expect(page.locator("#actions .btn").filter({ hasText: /look around|craft|build/ }).first()).toContainText("look around");
    await expect(page.locator('#inventory .row[data-id="knife"]')).toBeVisible();
    await expect(page.locator("#consumablesBox")).toBeHidden();
    // the same panels in every layout; the story shows the newest line (older text may have
    // scrolled out: layouts keep a different number of paragraphs)
    const newest = await page.evaluate(() =>
      (window as unknown as { ti: { state(): { log: Array<{ text: string }> } } }).ti.state().log[0].text);
    await expect(page.locator("#log")).toContainText(newest);
    await expect(page.locator("#status .row")).toHaveCount(5);
    // the game moves on between layouts: the 3rd look finds the cliff ("climb the cliff"), the 4th the fish ("catch a fish")
    const tasks = i < 2 ? ["survive the first night"]
      : i < 3 ? ["survive the first night", "cut logs", "make a bed"]
      : i < 4 ? ["survive the first night", "climb the cliff", "cut logs", "make a bed"]
      : ["survive the first night", "catch a fish", "climb the cliff", "cut logs", "make a bed"];
    await expect(page.locator("#quests .quest .title")).toHaveText(tasks);
    await expect(page.locator("#inventory .row .key")).toHaveText(["knife", "summer clothes"]);
    // and the game plays: one more landmark explored per layout (4 on the beach)
    if (i < 4) await explore(page);
  }
  await expect(page.locator("#log")).toContainText("a school of small fish");

  // one font for all text in every layout; Times is the default; the choice is remembered
  const fontOf = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontFamily);
  await expect(page.locator("#fontBtn")).toHaveText("font: times.");
  await page.locator("#fontBtn").click();
  await page.locator('#fontMenu [data-font="garamond_italic"]').click();
  await expect(page.locator("#fontBtn")).toHaveText("font: garamond italic.");
  for (const sel of ["#log .entry", "#actions .btn", "#status .key", "#fontBtn"]) {
    expect(await fontOf(sel), sel).toContain("Cormorant Garamond");
  }
  await expect(page.locator("#log .entry").first()).toHaveCSS("font-style", "italic");
  await page.locator("#layoutBtn").click();
  await page.locator('#layoutMenu [data-layout="bujo"]').click();
  for (const sel of [".bj-title", "#log .day", "#log .entry", "#clock", "#tabs .tab"]) {
    expect(await fontOf(sel), sel).toContain("Cormorant Garamond");
  }
  await page.reload();
  await expect(page.locator("#fontBtn")).toHaveText("font: garamond italic.");

  // the choice survives a reload
  await page.locator("#layoutBtn").click();
  await page.locator('#layoutMenu [data-layout="notebook"]').click();
  await page.reload();
  await expect(page.locator("#layoutBtn")).toHaveText("layout: notebook.");
  await expect(page.locator("#log .entry.latest")).toBeVisible();
});

test("central sections keep local building controls and portable item controls usable in every layout", async ({ page }) => {
  await explore(page, "forest_edge");
  await explore(page, "rock_shelter");
  await page.evaluate(() => {
    const ti = (window as unknown as { ti: { give(i: string, n: number): void } }).ti;
    for (const [id, n] of Object.entries({ timber: 2, firewood: 7, stone: 2, matches: 1, raw_fish: 1, cooked_fish: 1, can_water: 1, water_can: 1 })) ti.give(id, n);
  });
  await expect(page.locator("#buildingsBox")).toBeHidden();
  await expect(page.locator("#consumablesBox")).toBeVisible();
  const main = page.locator("#actions .btn");
  await expect(main.locator(".label").filter({ hasText: /look around|craft|build/ })).toHaveText([/look around/, /craft/, /build/]);
  const positions = await main.evaluateAll((buttons) => buttons.slice(0, 3).map((b) => b.getBoundingClientRect().top));
  expect(new Set(positions).size).toBe(1);
  await action(page, "build").click();
  await page.locator('#eventChoices [data-choice="bed"]').click();
  await expect(page.locator("#buildingsBox")).toBeVisible();
  await page.locator("#eventBack").click();
  await action(page, "build").click();
  await page.locator('#eventChoices [data-choice="campfire"]').click();
  await action(page, "light fire").click();
  await expect(page.locator("#wrap")).not.toHaveClass(/busy/);
  for (const id of ["classic", "journal", "scene", "notebook", "stage", "bujo"]) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator("#layoutBtn").click();
    await page.locator(`#layoutMenu [data-layout="${id}"]`).click();
    await expect(page.locator(".action-sections > fieldset > legend")).toHaveText(["buildings", "consumables"]);
    await expect(page.locator('#buildings .control-row[data-id="bed"] .btn .label')).toHaveText("sleep");
    await expect(page.locator('#buildings .control-row[data-id="campfire"] .btn .label')).toHaveText(["stoke fire", "cook raw fish"]);
    await expect(page.locator("#inventory button")).toHaveCount(0);
    await expect(page.locator("#areaActions legend")).toHaveCount(0);
    await expect(page.locator("#actions .btn").filter({ hasText: /look around|craft|build/ }).first()).toContainText("look around");
    await page.setViewportSize({ width: 375, height: 667 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), id).toBeLessThanOrEqual(0);
    const cook = page.locator('#buildings .control-row[data-id="campfire"] .btn', { hasText: "cook raw fish" });
    await cook.scrollIntoViewIfNeeded();
    const box = (await cook.boundingBox())!;
    expect(box.x, id).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, id).toBeLessThanOrEqual(375);
    expect(box.height, id).toBeGreaterThanOrEqual(40);
  }
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

test("on a phone screen every layout fits the width, and its buttons are on screen and usable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 }); // a small phone (iPhone SE)
  await page.evaluate(() => localStorage.clear()); // every layout starts a new game, with the shipwreck
  for (const id of ["classic", "journal", "scene", "notebook", "stage", "bujo"]) {
    await page.goto(`./?speed=0.01&variants=first&layout=${id}`);
    // a new game: the shipwreck fits the phone, every choice is a full-width button on screen
    const panel = (await page.locator("#event .panel").boundingBox())!;
    expect(panel.x, `${id}: event panel`).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width, `${id}: event panel`).toBeLessThanOrEqual(375);
    const last = (await page.locator("#eventChoices .btn").last().boundingBox())!;
    expect(last.y + last.height, `${id}: event choice below the screen`).toBeLessThanOrEqual(667);
    await escapeShip(page, "knife");
    const look = action(page, "look around");
    await expect(look, id).toBeVisible();
    // no sideways scrolling
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${id}: page wider than the screen`).toBeLessThanOrEqual(0);
    // the first button is on the first screen, big enough for a finger, and nothing covers it
    const box = (await look.boundingBox())!;
    expect(box.y + box.height, `${id}: button below the first screen`).toBeLessThanOrEqual(667);
    expect(box.height, `${id}: button too small to tap`).toBeGreaterThanOrEqual(40);
    const topmost = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest(".btn")?.textContent ?? null,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    expect(topmost, `${id}: something covers the button`).toContain("look around");
    await explore(page, "forest_edge");
    await expect(tab(page, "the forest"), id).toBeVisible();
    // the layout menu opens as a sheet inside the screen
    await page.locator("#layoutBtn").click();
    const sheet = (await page.locator("#layoutMenu").boundingBox())!;
    expect(sheet.x, id).toBeGreaterThanOrEqual(0);
    expect(sheet.x + sheet.width, id).toBeLessThanOrEqual(375);
    await page.keyboard.press("Escape");
    await page.evaluate(() => localStorage.clear());
  }
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


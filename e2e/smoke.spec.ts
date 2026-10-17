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
  // ?speed=0.2 runs progress bars 5x faster so the flows finish quickly; the pacing test below uses normal speed.
  // ?variants=first always shows the first wording of each text, so the checks below can name it.
  await page.goto("./?speed=0.2&variants=first");
  // start every test from a fresh game, past the shipwreck with the knife (the "the story starts" test plays it)
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await escapeShip(page, "knife");
});

test.afterEach(() => {
  expect(errors, "no script errors in the console").toEqual([]);
});

const action = (page: Page, name: string) => page.locator("#actions .btn", { hasText: name });

/**
 * "look around" opens a pop-up; explore one landmark (by id, or the first offered), then close
 * what was found. Exploring takes game time but shows no progress bar.
 */
async function explore(page: Page, landmark?: string) {
  await action(page, "look around").click();
  const pick = landmark
    ? page.locator(`#eventChoices [data-choice="${landmark}"]`)
    : page.locator('#eventChoices .btn:not([data-choice="close"])').first();
  const id = await pick.getAttribute("data-choice");
  await pick.click();
  // what was found; the dunes and the cliff top put a place on the map, so those findings can also walk there
  const go: Record<string, string> = { forest_edge: "go to the forest30m", cliff_top: "go to the meadows1h" };
  if (id && go[id]) await expect(page.locator("#eventChoices .btn")).toHaveText([go[id]]);
  else await expect(page.locator("#eventChoices .btn")).toHaveCount(0);
  await expect(page.locator("#eventBack")).toBeVisible();
  await page.locator("#eventBack").click();
  await expect(page.locator("#event")).toBeHidden();
}

/** The opening event: grab one thing from the sinking ship, then close the swim to the shore. */
async function escapeShip(page: Page, choice: "knife" | "matches" | "water" | "rations") {
  await page.locator(`#eventChoices [data-choice="${choice}"]`).click();
  await page.locator('#eventChoices [data-choice="close"]').click();
  await expect(page.locator("#event")).toBeHidden();
}
const tab = (page: Page, name: string) => page.locator("#tabs .tab", { hasText: name });

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
  await expect(page.locator('#quests .quest[data-id="climb_cliff"] .needs')).toHaveText("needs: rope");
  await page.evaluate(() => (window as unknown as { ti: { give(i: string, n: number): void } }).ti.give("cordage", 1));
  await expect(page.locator('#quests .quest[data-id="climb_cliff"] .needs')).toHaveText("needs: rope ✓");
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
  // the spear can be crafted, the trap built: look around, craft and build share the first line (classic is wide enough)
  const y = async (name: string) => (await action(page, name).boundingBox())!.y;
  expect(await y("craft")).toBe(await y("look around"));
  expect(await y("build")).toBe(await y("look around"));
  // the river starts the fish trap task: 20 willow twigs; built from the build menu; then it is in the buildings panel
  const task = page.locator('#quests .quest[data-id="build_fish_trap"]');
  await expect(task).toBeVisible();
  await action(page, "cut willow twigs").click();
  await action(page, "cut willow twigs").click();
  await expect(task.locator(".progress")).toHaveText("willow twigs 20/20");
  await action(page, "build").click();
  await expect(page.locator("#eventTitle")).toHaveText("Build");
  await page.locator('#eventChoices [data-choice="fish_trap"]').click();
  const trap = page.locator('#buildings .row[data-id="fish_trap"]');
  await expect(page.locator("#eventTitle")).toHaveText("Task done: build a fish trap");
  await expect(page.locator("#eventText")).toContainText("Fish trap built.");
  await page.locator("#eventBack").click();
  await expect(trap.locator(".val")).toHaveText("not set");
  await trap.locator(".sbtn").click();
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
  await expect(page.locator("#stores")).toContainText("matches");
  await expect(page.locator("#inventory .row .key")).toHaveText(["summer clothes"]);

  // the choice is saved: a reload goes straight to the beach
  await page.reload();
  await expect(event).toBeHidden();
  await expect(action(page, "look around")).toBeVisible();
});

test("the game is visible and not covered on load", async ({ page }) => {
  await expect(page).toHaveTitle("Mysteryless Island");
  await expect(page.locator("#log")).toContainText("Awake. Salt in the mouth.");
  // the game starts with a single button (craft and build appear once there is something to make)
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
  await expect(page.locator("#mapTip .map-icon-name")).toHaveText(["fire", "sleep"]);
  await tab(page, "the forest").hover();
  await expect(page.locator("#mapTip .map-icon-name")).toHaveText(["wood"]);
  await page.mouse.move(0, 0);
  await expect(page.locator("#mapTip")).toBeHidden();
  await expect(action(page, "light fire")).toBeVisible();
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
  await expect(page.locator("#stores")).toContainText("firewood");
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
  });
  const cook = page.locator('#stores .row[data-id="raw_fish"] .iaction');
  await expect(cook).toHaveCount(0);
  await action(page, "light fire").click();
  await expect(page.locator("#log")).toContainText("The fire takes");
  await expect(action(page, "stoke fire")).toBeVisible();
  await expect(action(page, "sleep")).not.toHaveClass(/off/);
  await expect(cook).toBeVisible();
  await cook.click();
  await expect(page.locator('#stores .row[data-id="cooked_fish"]')).toBeVisible();
});

test("finding the fish starts 'catch a fish' (it needs a spear or a trap); the spear comes from the craft menu", async ({ page }) => {
  for (let i = 0; i < 4; i++) await explore(page); // dunes, rocks, cliff, shallows
  const quest = page.locator('#quests .quest[data-id="first_catch"]');
  await expect(quest.locator(".title")).toHaveText("catch a fish");
  await expect(quest.locator("button")).toHaveCount(0); // tasks have no buttons
  await expect(quest.locator(".needs")).toHaveText("needs: fishing spear or fish trap"); // in its tooltip
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
  await expect(quest.locator(".needs")).toHaveText("needs: fishing spear ✓ or fish trap");
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
  await action(page, "craft").click();
  await expect(page.locator('#eventChoices [data-choice="craft_rock_knife"]')).toHaveCount(0);
  await expect(page.locator('#eventChoices [data-choice="craft_spear"]')).toHaveText("fishing spear1h");
  await page.locator('#eventChoices [data-choice="craft_spear"]').click();
  await expect(page.locator("#inventory")).toContainText("fishing spear");
});

test("while an action runs, the controls are locked and greyed out", async ({ page }) => {
  await page.goto("./?variants=first"); // normal speed
  await explore(page, "forest_edge"); // the way to the forest
  await tab(page, "the forest").click(); // walking: no progress bar, you are there at once
  await expect(page.locator("#wrap")).not.toHaveClass(/busy/);
  await expect(tab(page, "the forest")).toHaveClass(/here/);
  await action(page, "collect wood").click(); // 30 min, with a progress bar
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

test("every layout can be chosen from the menu, shows all panels, plays, and is remembered", async ({ page }) => {
  const layouts = ["journal", "scene", "notebook", "bujo", "stage", "classic"];
  for (const [i, id] of layouts.entries()) {
    await page.locator("#layoutBtn").click();
    await expect(page.locator("#layoutMenu")).toBeVisible();
    await page.locator(`#layoutMenu [data-layout="${id}"]`).click();
    await expect(page.locator("#layoutMenu")).toBeHidden();
    await expect(page.locator("#layoutBtn")).toHaveText(`layout: ${id === "bujo" ? "old journal" : id}.`);
    await expect(page.locator("#app")).toHaveClass(new RegExp(`layout-${id}`));
    // the same panels in every layout; the story shows the newest line (older text may have
    // scrolled out: layouts keep a different number of paragraphs)
    const newest = await page.evaluate(() =>
      (window as unknown as { ti: { state(): { log: Array<{ text: string }> } } }).ti.state().log[0].text);
    await expect(page.locator("#log")).toContainText(newest);
    await expect(page.locator("#status .row")).toHaveCount(5);
    // the game moves on between layouts: the 3rd look finds the cliff ("climb the cliff"), the 4th the fish ("catch a fish")
    const tasks = i < 3 ? ["survive the first night"]
      : i < 4 ? ["survive the first night", "climb the cliff"]
      : ["survive the first night", "catch a fish", "climb the cliff"];
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

test("on a phone screen every layout fits the width, and its buttons are on screen and usable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 }); // a small phone (iPhone SE)
  await page.evaluate(() => localStorage.clear()); // every layout starts a new game, with the shipwreck
  for (const id of ["classic", "journal", "scene", "notebook", "stage", "bujo"]) {
    await page.goto(`./?speed=0.2&variants=first&layout=${id}`);
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
    t.stat("health", 1);
    t.stat("thirst", 100);
  });
  const dieExploring = async () => {
    await ti();
    await action(page, "look around").click();
    await page.locator('#eventChoices .btn:not([data-choice="close"])').first().click(); // an hour of thirst kills
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
  await expect(page.locator("#endText")).toContainText("Cause of death: thirst.");
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


import { expect, test, type Page } from "@playwright/test";

async function open(page: Page, kind: string, id: string) {
  await page.goto("/studio/");
  if (kind === "area") {
    await page.getByRole("navigation").getByRole("button", { name: "the beach", exact: true }).click();
  } else {
    await page.getByRole("navigation").getByRole("button", { name: new RegExp(`^${kind}`) }).click();
    await page.getByRole("searchbox").fill(id);
    await page.getByRole("region", { name: "Entity list" }).getByRole("button")
      .filter({ has: page.locator("code", { hasText: new RegExp(`^${id}$`) }) }).click();
  }
}
const edit = (page: Page, path: string) => page.getByRole("button", { name: `Edit ${path}`, exact: true });
const editor = (page: Page, path: string) => page.locator(`[data-entry-editor="${path}"]`);

test("object rows summarize actions, ways and beach landmarks with keyboard and selection-safe expansion", async ({ page }) => {
  for (const [kind, id, path, title] of [
    ["Items", "water_can", "actions.0", "fill"],
    ["Recipes", "craft_spear", "ways.0", "Way 1"],
    ["area", "beach", "explore.landmarks.0", "the dunes"],
  ]) {
    await open(page, kind, id);
    await expect(edit(page, path)).toHaveAttribute("aria-expanded", "false");
    await expect(editor(page, path)).toBeHidden();
    const row = edit(page, path).locator("..");
    await expect(row.locator(".entry-title")).toContainText(title);
    await expect(row.locator(".entry-meta")).not.toHaveText("");
    await edit(page, path).focus();
    await page.keyboard.press("Enter");
    await expect(editor(page, path)).toBeVisible();
    await page.keyboard.press("Space");
    await expect(editor(page, path)).toBeHidden();
    await row.locator(".entry-title").evaluate(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    });
    await row.locator(".entry-meta").dispatchEvent("click");
    await expect(editor(page, path)).toBeHidden();
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await row.locator(".entry-meta").click();
    await expect(editor(page, path)).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.setViewportSize({ width: 1440, height: 900 });
  }
});

test("a single way starts open and new object entries expand and focus their first field", async ({ page }) => {
  await open(page, "Recipes", "craft_axe");
  await expect(edit(page, "ways.0")).toHaveAttribute("aria-expanded", "true");
  for (const [kind, id, add, path, first] of [
    ["Items", "water_can", "Add actions entry", "actions.2", "actions.2.hours"],
    ["Recipes", "craft_spear", "Add ways entry", "ways.2", "ways.2.hours"],
    ["area", "beach", "Add landmark", "explore.landmarks.5", "explore.landmarks.5.id"],
  ]) {
    await open(page, kind, id);
    await page.getByRole("button", { name: add, exact: true }).click();
    await expect(edit(page, path)).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(`[aria-label="${first}"]`)).toBeFocused();
  }
});

test("rail Show reveals diagnostics inside each collapsed editor and clearing problems keeps it open", async ({ page, request }) => {
  const pack = await (await request.get("/__studio/files")).json();
  for (const [filePath, modify] of [
    ["content/items/water_can.json", (raw: any) => { raw.actions[0].hours = -1; }],
    ["content/recipes/craft_spear.json", (raw: any) => { raw.ways[0].hours = -1; }],
    ["content/regions/beach.json", (raw: any) => { raw.explore.landmarks[0].hours = -1; }],
  ] as const) {
    const file = pack.files.find((f: { path: string }) => f.path === filePath);
    const raw = JSON.parse(file.content); modify(raw); file.content = JSON.stringify(raw);
  }
  await page.route("**/__studio/files", route => route.fulfill({ json: pack }));
  for (const [kind, id, path] of [
    ["Items", "water_can", "actions.0"], ["Recipes", "craft_spear", "ways.0"], ["area", "beach", "explore.landmarks.0"],
  ]) {
    await open(page, kind, id);
    await expect(edit(page, path)).toHaveAttribute("aria-expanded", "true");
    await edit(page, path).click();
    await expect(editor(page, path)).toBeHidden();
    const rail = page.getByRole("complementary", { name: "Document context" });
    await rail.getByRole("button").filter({ hasText: `${path}.hours` }).first().click();
    await expect(edit(page, path)).toHaveAttribute("aria-expanded", "true");
    const hours = page.getByRole("spinbutton", { name: `${path}.hours`, exact: true });
    await expect(hours).toBeFocused();
    await hours.fill("1");
    await expect(edit(page, path)).toHaveAttribute("aria-expanded", "true");
  }
});

test("move and remove preserve expansion for actions, ways and landmarks; referenced landmark removal stays blocked", async ({ page, request }) => {
  const pack = await (await request.get("/__studio/files")).json();
  const beach = pack.files.find((f: { path: string }) => f.path === "content/regions/beach.json");
  const raw = JSON.parse(beach.content);
  raw.explore.landmarks.splice(1, 0, { ...raw.explore.landmarks[1], id: "unreferenced_entry" });
  beach.content = JSON.stringify(raw);
  await page.route("**/__studio/files", route => route.fulfill({ json: pack }));
  for (const [kind, id, prefix, move, remove, title] of [
    ["Items", "water_can", "actions", "Move down actions.0", "Remove actions.0", "fill"],
    ["Recipes", "craft_spear", "ways", "Move down ways.0", "Remove ways.0", "Way 1"],
    ["area", "beach", "explore.landmarks", "Move down landmark forest_edge", "Remove landmark unreferenced_entry", "the dunes"],
  ]) {
    await open(page, kind, id);
    await edit(page, `${prefix}.0`).click();
    await page.getByRole("button", { name: move, exact: true }).click();
    await expect(edit(page, `${prefix}.1`)).toHaveAttribute("aria-expanded", "true");
    await expect(edit(page, `${prefix}.0`)).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: remove, exact: true }).click();
    await expect(edit(page, `${prefix}.0`)).toHaveAttribute("aria-expanded", "true");
    if (kind !== "Recipes") await expect(edit(page, `${prefix}.0`).locator("..")).toContainText(title);
  }
  await open(page, "area", "beach");
  await page.getByRole("button", { name: "Remove landmark forest_edge", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Removal blocked: this landmark is referenced.");
  await expect(page.getByRole("region", { name: "Landmark forest_edge", exact: true })).toBeVisible();
});


test("action expansion survives Undo, Redo and document navigation; Tab follows the row actions", async ({ page }) => {
  await open(page, "Items", "water_can");
  const toggle = edit(page, "actions.1");
  await toggle.click();
  await toggle.focus();
  for (const name of ["Move up actions.1", "Remove actions.1"]) {
    // The last entry's disabled down button is skipped by native Tab navigation.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name, exact: true })).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(page.getByRole("textbox", { name: "actions.1.id", exact: true })).toBeFocused();
  const hours = page.getByRole("spinbutton", { name: "actions.1.hours", exact: true });
  await hours.fill("0.5");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(hours).toHaveValue("0.25");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(hours).toHaveValue("0.5");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const search = page.getByRole("searchbox");
  const select = (id: string) => page.getByRole("region", { name: "Entity list" }).getByRole("button")
    .filter({ has: page.locator("code", { hasText: new RegExp(`^${id}$`) }) }).click();
  await search.fill("raw_meat");
  await select("raw_meat");
  await expect(edit(page, "actions.1")).toHaveAttribute("aria-expanded", "false");
  await search.fill("water_can");
  await select("water_can");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(edit(page, "actions.0")).toHaveAttribute("aria-expanded", "false");
  await open(page, "Items", "water_can");
  await expect(edit(page, "actions.1")).toHaveAttribute("aria-expanded", "false");
});

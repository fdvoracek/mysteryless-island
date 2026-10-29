import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";

const fish = "content/activities/catch_fish.json";
const newReason = "New file — remove it with ⋯ → Delete.";
const moveReason = "Part of a rename — Undo the rename to discard.";
const drawer = (page: Page) => page.getByRole("dialog", { name: "Unsaved changes" });
async function openFish(page: Page) {
  await page.goto("/studio/");
  await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
  await page.getByRole("searchbox", { name: "Search content" }).fill("catch_fish");
  await page.getByRole("region", { name: "Entity list" }).getByRole("button")
    .filter({ has: page.locator("code", { hasText: /^catch_fish$/ }) }).click();
}
async function editFish(page: Page) {
  await page.getByRole("textbox", { name: "name", exact: true }).fill("catch fish drawer");
  await page.getByRole("spinbutton", { name: "outcomes.0.weight", exact: true }).fill("5");
  await expect(page.getByRole("button", { name: "1 unsaved changes", exact: true })).toHaveText("1 unsaved");
}
async function createItem(page: Page) {
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create entity" });
  await dialog.getByLabel("Create kind").selectOption("items");
  await dialog.getByRole("textbox", { name: "id", exact: true }).fill("drawer_item");
  await dialog.getByRole("textbox", { name: "name", exact: true }).fill("drawer item");
  await dialog.getByRole("combobox", { name: "category", exact: true }).selectOption("material");
  await dialog.getByRole("button", { name: "Create draft" }).click();
}

test("two-field diff, keyboard close/focus, Discard refresh, Undo/Redo and path navigation", async ({ page }) => {
  await openFish(page);
  await expect(page.getByRole("button", { name: /unsaved changes/ })).toHaveCount(0);
  await editFish(page);
  const trigger = page.getByRole("button", { name: "1 unsaved changes", exact: true });
  await trigger.focus(); await page.keyboard.press("Enter");
  const dialog = drawer(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save all (1 file)", exact: true })).toBeVisible();
  await expect(dialog).toContainText("activities/catch_fish.json");
  await expect(dialog).toContainText("modified");
  await expect(dialog.locator(".removed .diff-text")).toHaveText(['  "name": "catch fish",', '      "weight": 4,']);
  await expect(dialog.locator(".added .diff-text")).toHaveText(['  "name": "catch fish drawer",', '      "weight": 5,']);
  await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("button", { name: `Discard ${fish}`, exact: true }).click();
  await expect(dialog).toContainText("No unsaved changes");
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByRole("searchbox")).toBeFocused();
  await expect(page.getByRole("textbox", { name: "name", exact: true })).toHaveValue("catch fish");
  await expect(page.getByRole("spinbutton", { name: "outcomes.0.weight", exact: true })).toHaveValue("4");
  await expect(page.locator(".studio-status-bar")).toContainText("0 unsaved files");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "name", exact: true })).toHaveValue("catch fish drawer");
  await expect(page.getByRole("spinbutton", { name: "outcomes.0.weight", exact: true })).toHaveValue("5");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "name", exact: true })).toHaveValue("catch fish");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await trigger.click();
  await dialog.getByRole("button", { name: "activities/catch_fish.json", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "id", exact: true })).toHaveValue("catch_fish");
});

test("new-file refusal and full-width 390px drawer without horizontal scrolling", async ({ page }) => {
  await openFish(page); await createItem(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "1 unsaved changes", exact: true }).click();
  const dialog = drawer(page), discard = dialog.getByRole("button", { name: "Discard content/items/drawer_item.json", exact: true });
  await expect(discard).toBeDisabled(); await expect(discard).toHaveAttribute("title", newReason);
  await expect(dialog).toContainText(newReason);
  await expect(dialog).toHaveCSS("width", "390px");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect.poll(() => dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test("rename source and destination refuse Discard; Undo restores the rename", async ({ page }) => {
  await openFish(page);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Rename ID…", exact: true }).click();
  const rename = page.getByRole("dialog", { name: "Rename ID", exact: true });
  await rename.getByRole("textbox", { name: "New ID" }).fill("drawer_fish");
  await rename.getByRole("button", { name: "Stage rename" }).click();
  await page.getByRole("button", { name: /\d+ unsaved changes/ }).click();
  const dialog = drawer(page);
  for (const path of [fish, "content/activities/drawer_fish.json"]) {
    const section = dialog.getByRole("region", { name: path, exact: true });
    await expect(section.getByRole("button", { name: `Discard ${path}`, exact: true })).toBeDisabled();
    await expect(section.getByRole("button", { name: `Discard ${path}`, exact: true })).toHaveAttribute("title", moveReason);
    await expect(section).toContainText(moveReason);
    await expect(section).toContainText("moved");
  }
  const source = dialog.getByRole("region", { name: fish, exact: true });
  await expect(source).toContainText("moved to activities/drawer_fish.json");
  await expect(source.locator(".diff-line")).toHaveCount(0);
  const destination = dialog.getByRole("region", { name: "content/activities/drawer_fish.json", exact: true });
  await expect(destination).toContainText("renamed from activities/catch_fish.json");
  await expect(destination.locator(".removed .diff-text")).toHaveText(['  "id": "catch_fish",']);
  await expect(destination.locator(".added .diff-text")).toHaveText(['  "id": "drawer_fish",']);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: /unsaved changes/ })).toHaveCount(0);
  await openFish(page);
  await expect(page.getByRole("textbox", { name: "id", exact: true })).toHaveValue("catch_fish");
});

test("drawer Save writes both files, keeps the empty drawer open and restores focus to search", async ({ page }, testInfo) => {
  const root = testInfo.config.metadata.studioFixtureRoot as string;
  const original = await readFile(join(root, fish), "utf8");
  try {
    await openFish(page); await editFish(page); await createItem(page);
    await page.getByRole("button", { name: "2 unsaved changes", exact: true }).click();
    const dialog = drawer(page);
    const save = dialog.getByRole("button", { name: "Save all (2 files)", exact: true });
    await expect(save).toBeEnabled(); await save.click();
    await expect(dialog).toContainText("No unsaved changes");
    expect(JSON.parse(await readFile(join(root, fish), "utf8"))).toMatchObject({ name: "catch fish drawer", outcomes: expect.any(Array) });
    expect(JSON.parse(await readFile(join(root, "content/items/drawer_item.json"), "utf8"))).toMatchObject({ id: "drawer_item" });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("searchbox")).toBeFocused();
    await expect(page.getByRole("button", { name: /unsaved changes/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save all", exact: true })).toBeDisabled();
  } finally {
    await writeFile(join(root, fish), original);
    await unlink(join(root, "content/items/drawer_item.json")).catch(() => {});
  }
});

test("staged activity deletion is listed and Discard restores it", async ({ page }) => {
  // An unreferenced global activity in the fixture response exercises Delete without changing shipped links.
  await page.route("**/__studio/files", async route => {
    const data = await (await route.fetch()).json();
    data.files.push({ path: "content/activities/drawer_delete.json", hash: "delete-fixture", encoding: "utf8",
      content: JSON.stringify({ id: "drawer_delete", name: "drawer delete", hours: 1, effort: "rest", global: true, outcomes: [{ text: "Rest." }] }) });
    await route.fulfill({ json: data });
  });
  await page.goto("/studio/");
  await page.getByRole("searchbox").fill("drawer_delete");
  await page.getByRole("region", { name: "Entity list" }).getByRole("button").click();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog", { name: "Delete entity" }).getByRole("button", { name: "Delete draft" }).click();
  await page.getByRole("button", { name: /unsaved changes/ }).click();
  const dialog = drawer(page);
  await expect(dialog).toContainText("deleted");
  await dialog.getByRole("button", { name: "activities/drawer_delete.json", exact: true }).click();
  await expect(page.getByRole("region", { name: "File contents" })).toContainText('"id": "drawer_delete"');
  await page.getByRole("button", { name: /unsaved changes/ }).click();
  await dialog.getByRole("button", { name: "Discard content/activities/drawer_delete.json", exact: true }).click();
  await expect(dialog).toContainText("No unsaved changes");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Entity list" })).toContainText("drawer_delete");
});

test("drawer explains validation blocking and respects reduced motion", async ({ page }) => {
  await openFish(page);
  await page.getByRole("spinbutton", { name: "outcomes.0.weight", exact: true }).fill("-1");
  await expect(page.getByRole("status")).not.toHaveText("Validating…");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: /unsaved changes/ }).click();
  const dialog = drawer(page);
  await expect(dialog.getByRole("button", { name: "Save all (1 file)", exact: true })).toBeDisabled();
  await expect(dialog).toContainText(/Fix \d+ problems? first/);
  await expect(dialog).toHaveCSS("animation-name", "none");
});

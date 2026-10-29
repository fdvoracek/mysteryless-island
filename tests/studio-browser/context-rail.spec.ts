import { expect, test, type Page } from "@playwright/test";

async function openFish(page: Page) {
  await page.goto("/studio/");
  await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
  await page.getByRole("navigation").getByRole("button", { name: /^Activities/ }).click();
  await page.getByRole("searchbox", { name: "Search content" }).fill("catch_fish");
  await page.getByRole("region", { name: "Entity list" }).getByRole("button").filter({ has: page.locator("code", { hasText: /^catch_fish$/ }) }).click();
}
const rail = (page: Page) => page.getByRole("complementary", { name: "Document context" });

test("context links open Uses definitions and incoming source fields", async ({ page }) => {
  await openFish(page);
  await expect(rail(page)).toContainText("✓ No problems");
  await expect(rail(page)).toContainText(/beach · activity \d+ of \d+/);
  await rail(page).getByRole("button").filter({ hasText: /fishing_spear.*item/ }).click();
  await expect(page.locator(".document-heading")).toContainText("content/items/fishing_spear.json");
  await expect(page.getByRole("region", { name: "File contents" })).toContainText("Field: id");
  await expect(page.getByRole("textbox", { name: "id", exact: true })).toBeFocused();
  await openFish(page);
  const incoming = rail(page).getByRole("button").filter({ hasText: "content/activities/sleep.json ›" }).first();
  const sourcePath = (await incoming.locator("code").innerText()).split(" › ")[1];
  await incoming.click();
  await expect(page.locator(".document-heading")).toContainText("content/activities/sleep.json");
  await expect(page.getByRole("region", { name: "File contents" })).toContainText(`Field: ${sourcePath}`);
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest("[data-field]")?.getAttribute("data-field"))).toBe(sourcePath);
});

test("rail diagnostics reveal and focus fields; both rename entry points share the dialog", async ({ page }) => {
  await openFish(page);
  const hours = page.getByRole("spinbutton", { name: "hours", exact: true });
  await hours.fill("0");
  const problem = rail(page).getByRole("button").filter({ hasText: /^hours —/ });
  await expect(problem).toBeVisible();
  await problem.click();
  await expect(hours).toBeFocused();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(rail(page)).toContainText("✓ No problems");
  await page.getByRole("button", { name: "More actions" }).click();
  await page.locator(".more-menu-list").getByRole("button", { name: "Rename ID…", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Rename ID" })).toBeVisible();
  await page.keyboard.press("Escape");
  await rail(page).getByRole("button", { name: "Rename id", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Rename ID" })).toBeVisible();
});

test("desktop rail follows editor in DOM, stays beside it, and stacks with Preview without squeezing it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFish(page);
  const editor = page.locator(".document-editor");
  const editorBounds = (await editor.boundingBox())!;
  const bounds = (await rail(page).boundingBox())!;
  expect(bounds.width).toBe(280);
  expect(bounds.x).toBeGreaterThanOrEqual(editorBounds.x + editorBounds.width);
  await expect(rail(page)).toHaveCSS("position", "sticky");
  expect(await page.locator(".document-panel").evaluate(element => Array.from(element.children).map(child => child.className)))
    .toEqual(["document-editor", "context-rail", "diagnostics"]);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const previewEditor = (await editor.boundingBox())!;
  const stacked = (await rail(page).boundingBox())!;
  expect(previewEditor.width).toBeGreaterThanOrEqual(480);
  expect(stacked.y).toBeGreaterThanOrEqual(previewEditor.y + previewEditor.height);
  await expect(rail(page)).toHaveCSS("position", "static");
  await rail(page).getByRole("button", { name: "Rename id", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Rename ID" })).toBeVisible();
});

test("1024px rail stacks and remains keyboard usable; 390px paths do not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await openFish(page);
  const editor = (await page.locator(".document-editor").boundingBox())!;
  const bounds = (await rail(page).boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(editor.y + editor.height);
  expect(bounds.width).toBe(editor.width);
  const rename = rail(page).getByRole("button", { name: "Rename id", exact: true });
  await rename.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(rename).toBeFocused();
  await expect(rename).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Rename ID" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await rail(page).getByRole("button").filter({ hasText: /fishing_spear.*item/ }).click();
  await expect(page.locator(".document-heading")).toContainText("content/items/fishing_spear.json");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("area reference groups move intact to the rail with explicit empty states; special views omit it", async ({ page }) => {
  await page.goto("/studio/");
  await page.getByRole("navigation").getByRole("button", { name: "forest", exact: true }).click();
  await page.getByRole("region", { name: "Entity list" }).getByRole("button").filter({ has: page.locator("code", { hasText: /^forest$/ }) }).click();
  await expect(rail(page).getByRole("region", { name: "Used by Area forest", exact: true })).toBeVisible();
  const groups = rail(page).getByRole("region", { name: /^Used by Landmark / });
  expect(await groups.count()).toBeGreaterThan(0);
  for (const group of await groups.all()) {
    if (!(await group.getByRole("button").count())) await expect(group).toContainText("Not referenced");
  }
  await expect(page.getByRole("region", { name: "Area workspace" })).not.toContainText("Used by");
  for (const name of ["Story", "Trees", "Map"]) {
    await page.getByRole("navigation").getByRole("button", { name, exact: true }).click();
    await expect(rail(page)).toHaveCount(0);
  }
});

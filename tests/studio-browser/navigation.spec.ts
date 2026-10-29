import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page) => page.getByRole("navigation", { name: "Content navigation" });
const list = (page: Page) => page.getByRole("region", { name: "Entity list" });
const forestRow = (page: Page) => list(page).getByRole("button").filter({ has: page.locator("code", { hasText: /^forest$/ }) });

test("area scope, All files, Areas and search all open the area workspace", async ({ page }) => {
  await page.goto("/studio/");
  await nav(page).getByRole("button", { name: "the forest", exact: true }).click();
  await expect(page.getByRole("region", { name: "Area workspace", exact: true })).toBeVisible();
  await expect(list(page)).toContainText("forest");
  await expect(list(page)).toContainText("gather_wood");
  await expect(list(page)).not.toContainText("collect_stones");
  await expect(list(page).getByRole("button", { pressed: true })).toContainText("forest");
  for (const scope of [/^All files/, /^Areas/]) {
    await nav(page).getByRole("button", { name: scope }).click();
    await forestRow(page).click();
    await expect(page.getByRole("region", { name: "Area workspace", exact: true })).toBeVisible();
  }
  await nav(page).getByRole("button", { name: /^All files/ }).click();
  await page.getByRole("searchbox").fill("forest");
  await forestRow(page).click();
  await expect(page.getByRole("region", { name: "Area workspace", exact: true })).toBeVisible();
});

test("contextual create stages an activity and its area link together and selects Items for new items", async ({ page, request }) => {
  await page.goto("/studio/");
  await nav(page).getByRole("button", { name: "the forest", exact: true }).click();
  await list(page).getByRole("button", { name: "+ New activity in the forest", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create entity" });
  await expect(dialog.getByLabel("Create kind")).toHaveValue("activities");
  await dialog.getByRole("textbox", { name: "id", exact: true }).fill("ux_seven_work");
  await dialog.getByRole("textbox", { name: "name", exact: true }).fill("new work");
  await dialog.getByRole("spinbutton", { name: "hours", exact: true }).fill("1");
  await dialog.getByRole("combobox", { name: "effort", exact: true }).selectOption("light");
  await dialog.getByRole("button", { name: "Create draft", exact: true }).click();
  await expect(page.getByRole("button", { name: "2 unsaved changes", exact: true })).toBeVisible();
  await nav(page).getByRole("button", { name: "the forest", exact: true }).click();
  await expect(list(page)).toContainText("ux_seven_work");
  await expect(page.getByRole("region", { name: "Area workspace", exact: true })).toContainText("ux_seven_work");
  const disk = await (await request.get("/__studio/files")).json();
  expect(disk.files.some((file: { path: string }) => file.path.includes("ux_seven_work"))).toBe(false);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(list(page)).not.toContainText("ux_seven_work");
  await nav(page).getByRole("button", { name: /^Items/ }).click();
  await list(page).getByRole("button", { name: "+ New item", exact: true }).click();
  await expect(dialog.getByLabel("Create kind")).toHaveValue("items");
});

test("sidebar buttons work by keyboard and the 390px list distinguishes light fire methods without overflow", async ({ page }) => {
  await page.goto("/studio/");
  const map = nav(page).getByRole("button", { name: "Map", exact: true });
  await map.focus();
  for (const name of ["Story", "Trees", "the beach", "the forest", "the meadows", "+ New area"]) {
    await page.keyboard.press("Tab");
    await expect(nav(page).getByRole("button", { name, exact: true })).toBeFocused();
  }
  await nav(page).getByRole("button", { name: "the beach", exact: true }).focus();
  await page.keyboard.press("Enter");
  const fire = list(page).locator(".entity-row").filter({ has: page.locator("strong", { hasText: /^light fire$/ }) });
  await expect(fire).toHaveCount(3);
  expect(new Set(await fire.locator(".entity-row-meta").allTextContents()).size).toBe(3);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(list(page).getByRole("button", { name: "+ New activity in the beach", exact: true })).toBeVisible();
});

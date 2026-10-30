import { expect, test, type Page } from "@playwright/test";

async function forest(page: Page) {
  await page.goto("/studio/");
  await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
  await page.getByRole("navigation").getByRole("button", { name: "the forest", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "id", exact: true })).toHaveValue("forest");
}
const card = (page: Page, title: string) => page.locator(".area-workspace > .form-section").filter({ has: page.locator("summary strong", { hasText: new RegExp(`^${title}$`) }) });

test("area cards remember collapsed landmarks and linked activities across reload", async ({ page }) => {
  await forest(page);
  await expect(page.locator(".area-workspace > .form-section")).toHaveCount(5);
  await expect(card(page, "Used by")).toHaveCount(0);
  const landmark = page.getByRole("region", { name: "Landmark spring", exact: true });
  const toolbar = landmark.locator(":scope > .entry-actions");
  await expect(toolbar).toHaveCSS("opacity", "0");
  await landmark.hover();
  await expect(toolbar).toHaveCSS("opacity", "1");
  await page.getByRole("navigation").hover();
  await landmark.getByRole("button", { name: "Remove landmark spring", exact: true }).focus();
  await expect(toolbar).toHaveCSS("opacity", "1");
  for (const [title, summary] of [["Landmarks", "landmarks: 2"], ["Linked activities", "activities: 4"]]) {
    await card(page, title).locator("summary").click();
    await expect(card(page, title)).not.toHaveAttribute("open");
    await expect(card(page, title).locator(".form-section-preview")).toHaveText(summary);
  }
  await page.reload();
  await page.getByRole("navigation").getByRole("button", { name: "the forest", exact: true }).click();
  for (const title of ["Landmarks", "Linked activities"]) await expect(card(page, title)).not.toHaveAttribute("open");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("studio.sections:Region")!))).toEqual(["Landmarks", "Linked activities"]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await card(page, "Landmarks").locator("summary").click();
  await expect(landmark.locator(":scope > .entry-actions")).toHaveCSS("opacity", "1");
});

test("area author note saves only its string with original key order and all other bytes intact", async ({ page, request }) => {
  const path = "content/regions/forest.json";
  const inventory = async () => (await (await request.get("/__studio/files")).json()).files as { path: string; content: string; hash: string }[];
  const original = (await inventory()).find(file => file.path === path)!;
  try {
    await forest(page);
    const note = page.getByRole("textbox", { name: "_map", exact: true });
    await expect(note).toBeVisible();
    const old = JSON.parse(original.content)._map;
    const replacement = "A revised map author note.";
    await note.fill(replacement);
    await page.getByRole("button", { name: "Save all", exact: true }).click();
    await expect(page.getByRole("log")).toContainText("Not written: none");
    const current = (await inventory()).find(file => file.path === path)!;
    expect(current.content).toBe(original.content.replace(JSON.stringify(old), JSON.stringify(replacement)));
  } finally {
    const current = (await inventory()).find(file => file.path === path)!;
    expect((await request.put(`/__studio/files/${path}`, { data: { expectedHash: current.hash, content: original.content, encoding: "utf8" } })).ok()).toBe(true);
  }
});

test("landmark diagnostics badge only Landmarks and reveal the collapsed card and focused field", async ({ page }) => {
  await forest(page);
  const hours = page.getByRole("spinbutton", { name: "explore.landmarks.0.hours", exact: true });
  await page.getByRole("button", { name: "Edit explore.landmarks.0", exact: true }).click();
  await hours.fill("0");
  await expect(card(page, "Landmarks").locator(".form-section-problems")).toHaveText("1 problem");
  await expect(card(page, "Text and exploration").locator(".form-section-problems")).toHaveCount(0);
  await card(page, "Landmarks").locator("summary").click();
  const stored = await page.evaluate(() => localStorage.getItem("studio.sections:Region"));
  await page.getByRole("region", { name: "Diagnostics" }).getByRole("button", { name: "content/regions/forest.json › explore.landmarks.0.hours", exact: true }).click();
  await expect(card(page, "Landmarks")).toHaveAttribute("open", "");
  await expect(hours).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem("studio.sections:Region"))).toBe(stored);
  await hours.fill("1");
  await expect(card(page, "Landmarks")).toHaveAttribute("open", "");
});

test("workspaces use bare compact cards, trailing optional lines and named entry controls", async ({ page }) => {
  await forest(page);
  const contents = page.getByRole("region", { name: "File contents" });
  await expect(contents).toHaveClass("json-panel json-panel-bare");
  const properties = card(page, "Properties");
  const optional = properties.locator(":scope > .form-section-body > section > .optional-fields");
  await expect(optional).toHaveCount(1);
  await expect(optional).toContainText("Optional:");
  await expect(optional.getByRole("button", { name: "Add artwork", exact: true })).toBeVisible();
  await expect(properties.locator(".field-with-note .optional-chip")).toHaveCount(0);
  await expect(properties.locator('[data-field="name"]')).toHaveCSS("margin-top", "0px");
  await expect(properties.locator('[data-field="name"]')).toHaveCSS("margin-bottom", "0px");
  const remove = page.getByRole("button", { name: "Remove landmark spring", exact: true });
  await expect(remove).toHaveText("×");
  const add = page.getByRole("button", { name: "Add landmark", exact: true });
  await expect(add).toHaveText("+ add landmark");
  await add.click();
  await expect(page.locator(".workspace-object-entry")).toHaveCount(3);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".workspace-object-entry")).toHaveCount(2);
  const rows = card(page, "Linked activities").locator(".linked-activity");
  const first = rows.first(), toolbar = first.locator(":scope > .entry-actions");
  const original = await first.locator(":scope > button").textContent();
  await page.getByRole("navigation").hover();
  await expect(toolbar).toHaveCSS("opacity", "0");
  await first.hover();
  await expect(toolbar).toHaveCSS("opacity", "1");
  await toolbar.getByRole("button", { name: /^Move down activity / }).click();
  await expect(first.locator(":scope > button")).not.toHaveText(original!);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(first.locator(":scope > button")).toHaveText(original!);
  const unlink = toolbar.getByRole("button", { name: /^Unlink / });
  await unlink.focus();
  await expect(toolbar).toHaveCSS("opacity", "1");
  await expect(unlink).toHaveText("×");
  await unlink.click();
  await expect(rows).toHaveCount(3);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(rows).toHaveCount(4);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toolbar).toHaveCSS("opacity", "1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("navigation").getByRole("button", { name: /^Events/ }).click();
  await expect(contents).toHaveClass("json-panel json-panel-bare");
  const event = page.locator('.event-workspace > .form-section');
  await expect(event.locator(":scope > .form-section-body > section > .optional-fields")).toHaveCount(1);
  await expect(event.locator(".field-with-note .optional-chip")).toHaveCount(0);
  await expect(event.locator('[data-field="title"]')).toHaveCSS("margin-top", "0px");
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  await expect(contents).toHaveClass("json-panel");
});

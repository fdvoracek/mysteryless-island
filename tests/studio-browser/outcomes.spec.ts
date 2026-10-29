import { expect, test, type Page } from "@playwright/test";
import { editorText, setEditorText } from "./editor";

async function openFish(page: Page) {
  await page.goto("/studio/");
  await page.getByRole("navigation").getByRole("button", { name: /^Activities/ }).click();
  await page.getByRole("searchbox").fill("catch_fish");
  await page.getByRole("region", { name: "Entity list" }).getByRole("button").filter({ has: page.locator("code", { hasText: /^catch_fish$/ }) }).click();
}
const edit = (page: Page, i = 0) => page.getByRole("button", { name: `Edit outcomes.${i}`, exact: true });
const weight = (page: Page, i = 0) => page.getByRole("spinbutton", { name: `outcomes.${i}.weight`, exact: true });
const undo = (page: Page) => page.getByRole("button", { name: "Undo", exact: true }).click();

test("outcomes show live shares, summary and weight diagnostics without opening their editor", async ({ page }) => {
  await openFish(page);
  await expect(page.locator(".outcome-share")).toHaveText(["40%", "40%", "20%"]);
  await expect(edit(page)).toHaveAttribute("aria-expanded", "false");
  await weight(page, 2).fill("4");
  await expect(page.locator(".outcome-share")).toHaveText(["33%", "33%", "33%"]);
  await expect(page.getByRole("region", { name: "Entity list" })).toContainText("Unsaved");
  await expect(edit(page)).toHaveAttribute("aria-expanded", "false");
  await undo(page);
  await expect(page.locator(".outcome-share")).toHaveText(["40%", "40%", "20%"]);
  await weight(page).fill("-1");
  await expect(page.locator(".outcome-entry").first()).toContainText("1 problem");
  await expect(edit(page)).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("region", { name: "Diagnostics" }).getByRole("button", { name: "content/activities/catch_fish.json › outcomes.0.weight", exact: true }).click();
  await expect(weight(page)).toBeFocused();
  await expect(edit(page)).toHaveAttribute("aria-expanded", "false");
  await undo(page);
  const results = page.locator(".form-section").filter({ has: page.locator("summary strong", { hasText: /^Results$/ }) });
  await results.locator("summary").click();
  await expect(results.locator(".form-section-preview")).toHaveText("40% give 2 raw_fish — raw fish · 40% give 1 raw_fish — raw fish · 20% nothing");
});

test("outcomes support keyboard editing, selection-safe clicks, ordering and add focus", async ({ page }) => {
  await openFish(page);
  await weight(page).focus();
  await page.keyboard.press("Tab");
  await expect(edit(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(edit(page)).toHaveAttribute("aria-expanded", "true");
  const text = page.getByRole("textbox", { name: "outcomes.0.text.0", exact: true });
  await text.fill("Edited fish text.");
  await expect(page.locator(".outcome-first").first()).toHaveText("Edited fish text.");
  await expect(page.getByRole("spinbutton", { name: "outcomes.0.weight", exact: true })).toHaveCount(1);
  await undo(page);
  await expect(edit(page)).toHaveAttribute("aria-expanded", "false");
  await page.locator(".outcome-text").first().click();
  await expect(edit(page)).toHaveAttribute("aria-expanded", "true");
  await page.locator(".outcome-text").first().click();
  await expect(edit(page)).toHaveAttribute("aria-expanded", "false");
  await page.locator(".outcome-first").first().evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  });
  await page.locator(".outcome-text").first().dispatchEvent("click");
  await expect(edit(page)).toHaveAttribute("aria-expanded", "false");
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.locator(".outcome-effects").first().click();
  await expect(edit(page)).toHaveAttribute("aria-expanded", "true");
  const down = page.getByRole("button", { name: "Move down outcomes.0", exact: true });
  await down.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(".outcome-first").first()).toHaveText("One fish. It will do.");
  await expect(edit(page, 1)).toHaveAttribute("aria-expanded", "true");
  await undo(page);
  await page.getByRole("button", { name: "Add outcomes entry", exact: true }).click();
  await expect(edit(page, 3)).toHaveAttribute("aria-expanded", "true");
  await expect(weight(page, 3)).toBeFocused();
  await expect(page.locator(".outcome-row")).toHaveCount(4);
  await undo(page);
  await expect(page.locator(".outcome-row")).toHaveCount(3);
  await page.getByRole("button", { name: "Remove outcomes.2", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".outcome-row")).toHaveCount(2);
  await undo(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(edit(page)).toBeVisible();
  await expect(edit(page)).toHaveCSS("opacity", "1");
});

test("interior outcome diagnostics reveal hidden editors before focusing their field", async ({ page, request }) => {
  const original = await (await request.get("/__studio/files")).json();
  const fish = original.files.find((file: { path: string }) => file.path === "content/activities/catch_fish.json");
  const raw = JSON.parse(fish.content);
  raw.outcomes[0].effects[0].give = { missing_outcome_item: 2 };
  fish.content = JSON.stringify(raw);
  await page.route("**/__studio/files", route => route.fulfill({ json: original }));
  await openFish(page);
  await expect(edit(page)).toHaveAttribute("aria-expanded", "true");
  await edit(page).click();
  await expect(edit(page)).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("region", { name: "Diagnostics" }).getByRole("button", { name: "content/activities/catch_fish.json › outcomes.0.effects.0.give.missing_outcome_item", exact: true }).click();
  await expect(edit(page)).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("spinbutton", { name: "outcomes.0.effects.0.give.missing_outcome_item", exact: true })).toBeFocused();
});

test("expanded outcome edits save only the intended text while preserving comment and key positions", async ({ page, request }) => {
  const path = "content/activities/catch_fish.json";
  const files = (await (await request.get("/__studio/files")).json()).files;
  const original = files.find((file: { path: string }) => file.path === path);
  const raw = JSON.parse(original.content);
  const first = raw.outcomes[0];
  raw.outcomes[0] = { _before: "keep", text: first.text, _middle: { keep: true }, weight: first.weight, effects: first.effects, _after: "keep too" };
  const { formatContent } = await import("../../src/content");
  const baseline = formatContent(raw);
  // Keep the text length stable so canonical line wrapping does not change.
  const changedText = "Edited: " + first.text[0].slice(8);
  let current = original;
  try {
    await request.put(`/__studio/files/${path}`, { data: { expectedHash: current.hash, content: baseline, encoding: "utf8" } });
    await openFish(page);
    await edit(page).click();
    await page.getByRole("textbox", { name: "outcomes.0.text.0", exact: true }).fill(changedText);
    const saved = page.waitForResponse(response => response.request().method() === "PUT" && response.url().endsWith(`/__studio/files/${path}`));
    await page.getByRole("button", { name: "Save all", exact: true }).click();
    expect((await saved).ok()).toBe(true);
    current = (await (await request.get("/__studio/files")).json()).files.find((file: { path: string }) => file.path === path);
    expect(current.content).toBe(baseline.replace(JSON.stringify(first.text[0]), JSON.stringify(changedText)));
  } finally {
    current = (await (await request.get("/__studio/files")).json()).files.find((file: { path: string }) => file.path === path);
    await request.put(`/__studio/files/${path}`, { data: { expectedHash: current.hash, content: original.content, encoding: "utf8" } });
  }
});


test("outcome carets stay visible without hover while order actions wait for hover or focus", async ({ page }) => {
  await openFish(page);
  await page.mouse.move(0, 0);
  for (let i = 0; i < 3; i++) {
    await expect(edit(page, i)).toBeVisible();
    await expect(edit(page, i)).toHaveText("▸");
    await expect(edit(page, i)).toHaveCSS("font-size", "14px");
    await expect(edit(page, i)).toHaveCSS("color", "rgb(138, 146, 156)");
    await expect(edit(page, i).locator("..")).toHaveCSS("opacity", "1");
    await expect(page.locator(".outcome-actions").nth(i)).toHaveCSS("opacity", "0");
  }
  await edit(page).click();
  await expect(edit(page)).toHaveText("▾");
  await expect(edit(page)).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".outcome-actions").first()).toHaveCSS("opacity", "1");
  await page.getByRole("searchbox").focus();
  await page.mouse.move(0, 0);
  await expect(page.locator(".outcome-actions").first()).toHaveCSS("opacity", "0");
  await page.locator(".outcome-row").first().hover();
  await expect(page.locator(".outcome-actions").first()).toHaveCSS("opacity", "1");
});

test("removing an expanded third outcome in JSON leaves no missing editor and supports Undo", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openFish(page);
  await edit(page, 2).click();
  await expect(edit(page, 2)).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  const raw = JSON.parse(await editorText(page));
  raw.outcomes.pop();
  await setEditorText(page, JSON.stringify(raw, null, 2));
  await expect(page.getByRole("region", { name: "Entity list" })).toContainText("Unsaved");
  await page.getByRole("button", { name: "Form", exact: true }).click();
  await expect(page.locator(".outcome-row")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Edit outcomes.2", exact: true })).toHaveCount(0);
  await expect(page.locator(".outcome-editor:not([hidden])")).toHaveCount(0);
  await undo(page);
  await expect(page.locator(".outcome-row")).toHaveCount(3);
  await expect(edit(page, 2)).toHaveAttribute("aria-expanded", "false");
  expect(errors).toEqual([]);
});

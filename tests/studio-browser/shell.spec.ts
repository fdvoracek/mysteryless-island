import { expect, test, type Page } from "@playwright/test";

async function openFish(page: Page) {
  await page.goto("/studio/");
  await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
  await page.getByRole("navigation").getByRole("button", { name: /^Activities/ }).click();
  await page.getByRole("searchbox", { name: "Search content" }).fill("catch_fish");
  await page.getByRole("region", { name: "Entity list" }).getByRole("button").filter({ has: page.locator("code", { hasText: /^catch_fish$/ }) }).click();
}

test("More actions returns focus on Escape and lets outside clicks focus and edit fields", async ({ page }) => {
  await openFish(page);
  const more = page.getByRole("button", { name: "More actions" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Duplicate", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  const name = page.getByRole("region", { name: "File contents" }).getByRole("textbox", { name: "name", exact: true });
  await name.click();
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(name).toBeFocused();
  await page.keyboard.type("x");
  await expect(name).toHaveValue("catch fishx");
  await expect(page.locator(".document-heading .unsaved-badge")).toHaveText("Unsaved");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(name).toHaveValue("catch fish");
  await expect(page.locator(".document-heading .unsaved-badge")).toHaveCount(0);
  await more.click();
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Duplicate entity" })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("textbox", { name: "name", exact: true })).toHaveValue("catch fish");
  await expect(more).toHaveAttribute("aria-expanded", "false");
});

test("validation focuses Diagnostics and status-bar refresh reads external changes", async ({ page, request }) => {
  const original = await (await request.get("/__studio/files")).json();
  let broken = false;
  await page.route("**/__studio/files", route => {
    const data = structuredClone(original);
    if (broken) {
      const file = data.files.find((file: { path: string }) => file.path === "content/activities/catch_fish.json");
      const raw = JSON.parse(file.content);
      raw.requires = { item: "missing_shell_item" };
      file.content = JSON.stringify(raw);
    }
    return route.fulfill({ json: data });
  });
  await openFish(page);
  const footer = page.locator(".studio-status-bar");
  await expect(footer).toContainText("0 unsaved files");
  broken = true;
  await footer.getByRole("button", { name: "Refresh from disk" }).click();
  await expect(page.getByRole("status")).toHaveText("1 problem");
  await page.getByRole("button", { name: "1 problem", exact: true }).click();
  await expect(page.getByRole("region", { name: "Diagnostics" })).toBeFocused();
  await expect(footer).toContainText("1 problem");
  broken = false;
  await footer.getByRole("button", { name: "Refresh from disk" }).click();
  await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
});

test("desktop document header sticks over a long form and footer leaves Diagnostics fully visible", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFish(page);
  const header = page.locator(".document-heading");
  await expect(header.locator(".unsaved-badge")).toHaveCount(0);
  await page.getByRole("textbox", { name: "name", exact: true }).fill("catch fish shell test");
  await expect(header.locator(".unsaved-badge")).toHaveText("Unsaved");
  await expect(page.locator(".studio-status-bar")).toContainText("1 unsaved files");
  await page.evaluate(() => window.scrollTo(0, 700));
  await expect(header).toHaveCSS("position", "sticky");
  await expect.poll(async () => (await header.boundingBox())!.y).toBe(0);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const heading = page.getByRole("region", { name: "Diagnostics" }).getByRole("heading");
  await expect(heading).toBeInViewport();
  const diagnostics = (await heading.boundingBox())!, footer = (await page.locator(".studio-status-bar").boundingBox())!;
  expect(diagnostics.y + diagnostics.height).toBeLessThanOrEqual(footer.y);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(header.locator(".unsaved-badge")).toHaveCount(0);
  await header.getByRole("button", { name: "Activities", exact: true }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.getByRole("region", { name: "Entity list" })).toContainText("gather_wood");
});

test("390px shell wraps without horizontal scroll and keeps header and footer in normal flow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFish(page);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.locator(".document-heading")).toHaveCSS("position", "static");
  await expect(page.locator(".studio-status-bar")).toHaveCSS("position", "static");
  await expect(page.locator(".shortcut-hints")).toBeHidden();
  await expect(page.getByRole("searchbox", { name: "Search content" })).toBeVisible();
  await page.getByRole("button", { name: "More actions" }).click();
  await expect(page.getByRole("button", { name: "Duplicate", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const footer = (await page.locator(".studio-status-bar").boundingBox())!;
  const diagnostics = (await page.getByRole("region", { name: "Diagnostics" }).boundingBox())!;
  expect(footer.y).toBeGreaterThanOrEqual(diagnostics.y + diagnostics.height);
  await expect(page.locator(".studio-status-bar")).toBeInViewport({ ratio: 1 });
});

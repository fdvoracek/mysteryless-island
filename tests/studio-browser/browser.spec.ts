import { expect, test } from "@playwright/test";

test("browses real files by area/kind, searches, and keeps JSON read-only at desktop and phone widths", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/studio/");
  await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
  const navigation = page.getByRole("navigation", { name: "Content navigation" });
  await navigation.getByRole("button", { name: "forest", exact: true }).click();
  const contents = page.getByRole("region", { name: "File contents" });
  await expect(contents).toContainText('"id": "forest"');
  await expect(contents).toContainText('"_map"');
  await expect(page.getByRole("region", { name: "Entity list" })).toContainText("gather_wood");
  await expect(page.getByRole("region", { name: "Entity list" })).not.toContainText("collect_stones");
  await navigation.getByRole("button", { name: /^Items/ }).click();
  await page.getByRole("searchbox").fill("knife");
  const list = page.getByRole("region", { name: "Entity list" });
  await list.getByRole("button").filter({ has: page.locator("code", { hasText: /^knife$/ }) }).click();
  await expect(contents).toContainText('"id": "knife"');
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.locator("textarea, [contenteditable=true]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Save/ })).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.screenshot({ path: "/tmp/textisland-studio-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("searchbox")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("searchbox").fill("nothing_matches_this");
  await expect(list).toContainText("No files match this search.");
  await page.screenshot({ path: "/tmp/textisland-studio-phone.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("refreshes external invalid content and links diagnostics to the entity and field", async ({ page, request }) => {
  // Read real transport output, then simulate an on-disk edit in memory; shipped files stay untouched.
  const response = await request.get("/__studio/files");
  const original = await response.json() as { files: { path: string; content: string }[] };
  let broken = false;
  await page.route("**/__studio/files", async (route) => {
    const data = structuredClone(original);
    if (broken) {
      const document = data.files.find((file) => file.path === "content/activities/gather_wood.json")!;
      const raw = JSON.parse(document.content);
      raw.requires = { item: "missing_browser_test_item" };
      document.content = JSON.stringify(raw);
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/studio/");
  await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
  broken = true;
  await page.getByRole("button", { name: "Refresh from disk" }).click();
  const diagnostics = page.getByRole("region", { name: "Diagnostics" });
  await expect(diagnostics).toContainText('unknown item "missing_browser_test_item"');
  await diagnostics.getByRole("button", { name: "content/activities/gather_wood.json › requires" }).click();
  await expect(page.getByRole("region", { name: "File contents" })).toContainText("Field: requires");
  await expect(page.getByRole("region", { name: "File contents" })).toContainText('"id": "gather_wood"');
  await expect(page.getByRole("status")).toHaveText("1 problem");
  broken = false;
  await page.getByRole("button", { name: "Refresh from disk" }).click();
  await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
});

test("shows file API failures and recovers on refresh", async ({ page }) => {
  await page.route("**/__studio/files", (route) => route.fulfill({ status: 500, json: { error: "Rejected test request" } }));
  await page.goto("/studio/");
  await expect(page.getByRole("alert")).toContainText("Rejected test request");
  await page.unroute("**/__studio/files");
  await page.getByRole("button", { name: "Refresh from disk" }).click();
  await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
});

for (const response of [
  { status: 403, json: { error: "Raw forbidden response" } },
  { status: 200, contentType: "text/html", body: "<!doctype html><h1>Wrong server</h1>" },
  { status: 500, contentType: "application/json", body: "{broken" },
]) {
  test(`offers the exact Studio URL for ${response.status} ${"json" in response ? "JSON rejection" : response.contentType}`, async ({ page }) => {
    await page.route("**/__studio/files", (route) => route.fulfill(response));
    await page.goto("/studio/");
    await expect(page.getByRole("alert")).toContainText("Open http://127.0.0.1:5175/studio/");
    await expect(page.getByRole("alert")).not.toContainText("Raw forbidden response");
    await expect(page.getByRole("alert")).not.toContainText("Unexpected token");
  });
}

import { z } from "zod";
import { Condition, Effect } from "../../src/content";
import { unionKinds } from "../../src/studio/describe";
import { unwrap, type Schema } from "../../src/studio/schema";
import { expect, test } from "@playwright/test";

test("browses frozen fixture files by area/kind, searches, and edits generic forms at desktop and phone widths", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/studio/");
  await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
  const navigation = page.getByRole("navigation", { name: "Content navigation" });
  await navigation.getByRole("button", { name: "forest", exact: true }).click();
  const contents = page.getByRole("region", { name: "File contents" });
  await expect(contents.getByRole("textbox", { name: "id", exact: true })).toHaveValue("forest");
  await expect(contents).toContainText('_map');
  await expect(page.getByRole("region", { name: "Entity list" })).toContainText("gather_wood");
  await expect(page.getByRole("region", { name: "Entity list" })).not.toContainText("collect_stones");
  await navigation.getByRole("button", { name: /^Items/ }).click();
  await page.getByRole("searchbox").fill("knife");
  const list = page.getByRole("region", { name: "Entity list" });
  await list.getByRole("button").filter({ has: page.locator("code", { hasText: /^knife$/ }) }).click();
  await expect(contents.getByRole("textbox", { name: "id", exact: true })).toHaveValue("knife");
  await expect(contents.getByRole("textbox", { name: "name", exact: true })).toHaveValue("knife");
  await expect(page.getByRole("button", { name: "Save all", exact: true })).toBeDisabled();
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
  // Read the isolated frozen pack, then simulate an external edit in memory.
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
  await diagnostics.getByRole("button", { name: "content/activities/gather_wood.json › requires.item" }).click();
  await expect(page.getByRole("region", { name: "File contents" })).toContainText("Field: requires.item");
  await expect(page.getByRole("region", { name: "File contents" }).getByRole("textbox", { name: "id", exact: true })).toHaveValue("gather_wood");
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

test("serves only the isolated frozen fixture pack and blocks the repository content route", async ({ request }, testInfo) => {
  const response = await request.get("/__studio/files");
  expect(response.ok()).toBe(true);
  const { files } = await response.json() as { files: { path: string; content: string }[] };
  const game = JSON.parse(files.find((file) => file.path === "content/game.json")!.content);
  expect(game._studio_fixture_root).toBe(testInfo.config.metadata.studioFixtureRoot);
  const gather = JSON.parse(files.find((file) => file.path === "content/activities/gather_wood.json")!.content);
  expect(gather.log[0]).toBe("Dry branches snap underfoot.");
  expect((await request.get("/content/game.json")).status()).toBe(403);
});

test("creates linked drafts, saves the whole pack, blocks used deletion, and wires undo and validation", async ({ page, request }) => {
  test.setTimeout(90_000);
  const response = await request.get("/__studio/files");
  const original = await response.json() as { files: { path: string; content: string; hash: string }[] };
  const areaPath = "content/regions/forest.json";
  const areaOriginal = original.files.find((file) => file.path === areaPath)!;
  const created = ["content/items/browser_material.json", "content/activities/browser_work.json"];
  try {
    await page.goto("/studio/");
    await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Create entity" });
    await dialog.getByLabel("Create kind").selectOption("items");
    await dialog.getByRole("textbox", { name: "id", exact: true }).fill("Bad ID");
    await expect(dialog.getByRole("button", { name: "Create draft" })).toBeDisabled();
    await dialog.getByRole("textbox", { name: "id", exact: true }).fill("knife");
    await expect(dialog).toContainText("Use a new, unique");
    await dialog.getByRole("textbox", { name: "id", exact: true }).fill("browser_material");
    await dialog.getByRole("textbox", { name: "name", exact: true }).fill("browser material");
    await dialog.getByRole("combobox", { name: "category", exact: true }).selectOption("material");
    await dialog.getByRole("button", { name: "Create draft" }).click();
    // Draft creation must never hit the file API.
    expect((await (await request.get("/__studio/files")).json()).files.some((f: { path: string }) => f.path === created[0])).toBe(false);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Create entity" });
    await dialog.getByLabel("Create kind").selectOption("activities");
    await dialog.getByRole("textbox", { name: "id", exact: true }).fill("browser_work");
    await dialog.getByRole("textbox", { name: "name", exact: true }).fill("browser work");
    await dialog.getByRole("spinbutton", { name: "hours", exact: true }).fill("1");
    await dialog.getByRole("combobox", { name: "effort", exact: true }).selectOption("light");
    await dialog.getByRole("button", { name: "Create draft" }).click();
    const contents = page.getByRole("region", { name: "File contents" });
    await expect(page.getByRole("button", { name: "Save all" })).toBeDisabled();
    await expect(page.getByRole("region", { name: "Diagnostics" })).toContainText("neither linked nor global");
    await contents.getByRole("button", { name: "Add yields", exact: true }).click();
    await contents.getByRole("button", { name: "Add yields entry", exact: true }).click();
    await contents.getByRole("combobox", { name: "yields.0.item", exact: true }).selectOption("browser_material");
    await contents.getByRole("spinbutton", { name: "yields.0.min", exact: true }).fill("1");
    await contents.getByRole("spinbutton", { name: "yields.0.max", exact: true }).fill("2");
    await page.getByRole("navigation").getByRole("button", { name: "forest", exact: true }).click();
    await contents.getByRole("combobox", { name: "Existing activity", exact: true }).selectOption("browser_work");
    await contents.getByRole("button", { name: "Link existing", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
    await page.getByRole("button", { name: "Save all" }).click();
    await expect(page.getByRole("log")).toContainText("Not written: none");
    const saved = (await (await request.get("/__studio/files")).json()).files as { path: string; content: string }[];
    expect(saved.find((f) => f.path === areaPath)!.content).toContain('"browser_work"');
    expect(saved.find((f) => f.path === created[1])!.content).toContain('"item": "browser_material"');
    await page.getByRole("searchbox").fill("browser_material");
    await page.getByRole("navigation").getByRole("button", { name: /^Items/ }).click();
    await page.getByRole("searchbox").fill("browser_material");
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const deletion = page.getByRole("dialog", { name: "Delete entity" });
    await expect(deletion).toContainText("Delete blocked");
    await expect(deletion).toContainText("content/activities/browser_work.json › yields.0.item");
    await expect(deletion.getByRole("button", { name: "Delete draft" })).toBeDisabled();
    await deletion.getByRole("button", { name: "Close dialog" }).click();
    await contents.getByRole("textbox", { name: "name", exact: true }).fill("edited material");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(contents.getByRole("textbox", { name: "name", exact: true })).toHaveValue("browser material");
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(contents.getByRole("textbox", { name: "name", exact: true })).toHaveValue("edited material");
    await contents.getByRole("button", { name: "Add max", exact: true }).click();
    await contents.getByRole("spinbutton", { name: "max", exact: true }).fill("-1");
    await expect(contents.locator('[data-field="max"]')).toContainText("greater than 0");
    await expect(page.getByRole("button", { name: "Save all" })).toBeDisabled();
  } finally {
    // Only the temporary STUDIO_ROOT is mutated; restore it for the remaining scenarios.
    const latest = (await (await request.get("/__studio/files")).json()).files as { path: string; hash: string }[];
    await request.put(`/__studio/files/${areaPath}`, { data: { expectedHash: latest.find((f) => f.path === areaPath)!.hash, content: areaOriginal.content, encoding: "utf8" } });
    for (const path of created) { const file = latest.find((f) => f.path === path); if (file) await request.delete(`/__studio/files/${path}`, { data: { expectedHash: file.hash } }); }
  }
});

test("shows a 409 conflict and requires explicit overwrite after keeping the draft", async ({ page, request }) => {
  test.setTimeout(60_000);
  const path = "content/items/knife.json";
  const original = (await (await request.get("/__studio/files")).json()).files.find((f: { path: string }) => f.path === path) as { content: string };
  try {
    await page.goto("/studio/");
    await page.getByRole("navigation").getByRole("button", { name: /^Items/ }).click();
    await page.getByRole("searchbox").fill("knife");
    await page.getByRole("region", { name: "Entity list" }).getByRole("button").filter({ has: page.locator("code", { hasText: /^knife$/ }) }).click();
    await page.getByRole("textbox", { name: "name", exact: true }).fill("draft knife");
    await page.route(`**/__studio/files/${path}`, (route) => route.fulfill({ status: 409, json: { error: "File changed on disk" } }));
    await page.getByRole("button", { name: "Save all" }).click();
    const conflict = page.getByRole("dialog", { name: "File changed on disk" });
    await expect(conflict).toBeVisible();
    await expect(page.getByRole("log")).toContainText(`Not written: ${path}`);
    await conflict.getByRole("button", { name: "Keep mine", exact: true }).click();
    await expect(conflict).not.toBeVisible();
    await expect(page.getByRole("textbox", { name: "name", exact: true })).toHaveValue("draft knife");
    await page.unroute(`**/__studio/files/${path}`);
    await page.getByRole("button", { name: "Save all" }).click();
    await expect(conflict).toBeVisible();
    await conflict.getByRole("button", { name: "Overwrite with freshly checked hash" }).click();
    await expect(conflict).not.toBeVisible();
    await expect(page.getByRole("log")).toContainText("Not written: none");
  } finally {
    const latest = (await (await request.get("/__studio/files")).json()).files.find((f: { path: string }) => f.path === path) as { hash: string };
    await request.put(`/__studio/files/${path}`, { data: { expectedHash: latest.hash, content: original.content, encoding: "utf8" } });
  }
});


test("retains invalid JSON across view switches and includes it in undo/redo", async ({ page }) => {
  await page.goto("/studio/");
  await page.getByRole("navigation").getByRole("button", { name: /^Items/ }).click();
  await page.getByRole("searchbox").fill("knife");
  await page.getByRole("region", { name: "Entity list" }).getByRole("button").filter({ has: page.locator("code", { hasText: /^knife$/ }) }).click();
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  const json = page.getByRole("textbox", { name: "JSON document", exact: true });
  const original = await json.inputValue();
  await json.fill("{broken JSON");
  await expect(page.getByRole("button", { name: "Save all" })).toBeDisabled();
  await expect(page.getByRole("status")).toHaveText("1 problem");
  await page.getByRole("button", { name: "Form", exact: true }).click();
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  await expect(json).toHaveValue("{broken JSON");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(json).toHaveValue(original);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(json).toHaveValue("{broken JSON");
  await json.fill(original);
  await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
  await expect(page.getByRole("button", { name: "Save all" })).toBeDisabled();
});

test("edits nested conditions with only keyboard controls, wraps not, rejects empty groups and saves", async ({ page, request }) => {
  const path = "content/activities/gather_wood.json";
  const inventory = (await (await request.get("/__studio/files")).json()).files;
  const original = inventory.find((f: { path: string }) => f.path === path);
  const activate = async (name: string) => { const button = page.getByRole("button", { name, exact: true }); await button.focus(); await page.keyboard.press("Enter"); };
  const choose = async (name: string, text: string) => {
    const select = page.getByRole("combobox", { name, exact: true });
    await select.focus(); await page.keyboard.press("Home");
    // Native type-ahead and Enter operate the select without pointer actions.
    await page.keyboard.type(text); await page.keyboard.press("Enter"); await page.keyboard.press("Tab");
  };
  try {
    await page.goto("/studio/");
    const nav = page.getByRole("navigation");
    await nav.getByRole("button", { name: /^Activities/ }).focus(); await page.keyboard.press("Enter");
    const search = page.getByRole("searchbox"); await search.focus(); await page.keyboard.type("gather_wood");
    const entry = page.getByRole("region", { name: "Entity list" }).getByRole("button").filter({ has: page.locator("code", { hasText: /^gather_wood$/ }) });
    await entry.focus(); await page.keyboard.press("Enter");
    await activate("Add visibleWhen");
    await choose("visibleWhen kind", "all");
    // Adding an optional condition starts with the schema's empty all group.
    await expect(page.locator('[data-field="visibleWhen"]')).toContainText("at least 1");
    await activate("Add condition to visibleWhen");
    await choose("visibleWhen.all.0 kind", "discovered");
    await choose("visibleWhen.all.0.discovered", "cliff_shells");
    await activate("Add group to visibleWhen");
    await choose("visibleWhen.all.1.all.0 kind", "item");
    await choose("visibleWhen.all.1.all.0.item", "knife");
    await activate("Add condition to visibleWhen.all.1");
    await activate("Remove visibleWhen.all.1.all.1");
    // not takes one child: preserve several children by wrapping them in all.
    await choose("visibleWhen kind", "not");
    await expect(page.getByRole("combobox", { name: "visibleWhen.not kind", exact: true })).toHaveValue("all");
    await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
    await activate("Save all");
    await expect(page.getByRole("log")).toContainText("Not written: none");
    const saved = (await (await request.get("/__studio/files")).json()).files.find((f: { path: string }) => f.path === path);
    const before = JSON.parse(original.content), after = JSON.parse(saved.content);
    expect(after.visibleWhen).toEqual({ not: { all: [{ discovered: "cliff_shells" }, { all: [{ item: "knife" }] }] } });
    delete after.visibleWhen; expect(after).toEqual(before);
    await activate("Remove visibleWhen.not.all.1");
    await activate("Remove visibleWhen.not.all.0");
    await expect(page.locator('[data-field="visibleWhen"]')).toContainText("at least 1");
    await expect(page.getByRole("button", { name: "Save all", exact: true })).toBeDisabled();
  } finally {
    const current = (await (await request.get("/__studio/files")).json()).files.find((f: { path: string }) => f.path === path);
    await request.put(`/__studio/files/${path}`, { data: { expectedHash: current.hash, content: original.content, encoding: "utf8" } });
  }
});

test("edits Text forms, alternatives and nested rolls without unrelated changes", async ({ page, request }) => {
  test.setTimeout(60_000);
  const path = "content/activities/gather_wood.json";
  const original = (await (await request.get("/__studio/files")).json()).files.find((f: { path: string }) => f.path === path);
  try {
    await page.goto("/studio/");
    await page.getByRole("navigation").getByRole("button", { name: /^Activities/ }).click();
    await page.getByRole("searchbox").fill("gather_wood");
    await page.getByRole("region", { name: "Entity list" }).getByRole("button").filter({ has: page.locator("code", { hasText: /^gather_wood$/ }) }).click();
    const text = page.getByRole("region", { name: "Text log", exact: true });
    await expect(text).toContainText("?variants=first");
    const count = await text.getByRole("textbox").count();
    await text.getByRole("button", { name: "Add alternative to log", exact: true }).click();
    await page.getByRole("textbox", { name: `log.${count}`, exact: true }).fill("{item} " + "x".repeat(81));
    await expect(text).toContainText("above journal guidance");
    await expect(text).toContainText("different {placeholder} sets");
    await expect(page.getByRole("button", { name: "Save all", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: `Move up log.${count}`, exact: true }).click();
    await page.getByRole("button", { name: `Remove log.${count - 1}`, exact: true }).click();
    await text.getByRole("combobox", { name: "log text form" }).selectOption("single");
    await expect(text).toContainText("Remove extra alternatives explicitly");
    await expect(text.getByRole("textbox")).toHaveCount(count);
    await text.getByRole("combobox", { name: "log text form" }).selectOption("explicit");
    await page.getByRole("textbox", { name: "log.id", exact: true }).fill("browser_log");
    await text.getByRole("combobox", { name: "log text form" }).selectOption("variants");
    await page.getByRole("button", { name: "Add effects", exact: true }).click();
    await page.getByRole("button", { name: "Add effects entry", exact: true }).click();
    await page.getByRole("combobox", { name: "effects.0 kind", exact: true }).selectOption("roll");
    await page.getByRole("button", { name: "Add roll entry", exact: true }).click();
    await page.getByRole("spinbutton", { name: "effects.0.roll.0.weight", exact: true }).fill("2");
    await page.getByRole("button", { name: "Add text", exact: true }).click();
    const outcomeText = page.getByRole("region", { name: "Text effects.0.roll.0.text", exact: true });
    await outcomeText.getByRole("textbox").fill("A line.\nAnother line.");
    await outcomeText.getByRole("combobox").selectOption("variants");
    await outcomeText.getByRole("combobox").selectOption("explicit");
    await outcomeText.getByRole("textbox", { name: "effects.0.roll.0.text.id", exact: true }).fill("browser_outcome_text");
    await outcomeText.getByRole("combobox").selectOption("single");
    await expect(outcomeText.getByRole("textbox")).toHaveValue("A line.\nAnother line.");
    await page.getByRole("button", { name: "Add effects", exact: true }).click();
    await page.locator('[data-field="effects.0.roll.0.effects"]').getByRole("button", { name: "Add effects entry", exact: true }).click();
    await page.getByRole("combobox", { name: "effects.0.roll.0.effects.0 kind", exact: true }).selectOption("flag");
    await page.getByRole("textbox", { name: "effects.0.roll.0.effects.0.flag", exact: true }).fill("browser_roll");
    await page.getByRole("button", { name: "Save all", exact: true }).click();
    await expect(page.getByRole("log")).toContainText("Not written: none");
    const baseline = (await (await request.get("/__studio/files")).json()).files.find((f: { path: string }) => f.path === path);
    await page.getByRole("spinbutton", { name: "effects.0.roll.0.weight", exact: true }).fill("3");
    // Disabled also means "save in flight"; wait for its acknowledged write
    // before reading the file API, rather than racing the PUT with a GET.
    const saved = page.waitForResponse(response => response.request().method() === "PUT" && response.url().endsWith(`/__studio/files/${path}`));
    await page.getByRole("button", { name: "Save all", exact: true }).click();
    expect((await saved).ok()).toBe(true);
    await expect(page.getByRole("button", { name: "Save all", exact: true })).toBeDisabled();
    const final = (await (await request.get("/__studio/files")).json()).files.find((f: { path: string }) => f.path === path);
    expect(final.content).toBe(baseline.content.replace('"weight": 2', '"weight": 3'));
  } finally {
    const current = (await (await request.get("/__studio/files")).json()).files.find((f: { path: string }) => f.path === path);
    await request.put(`/__studio/files/${path}`, { data: { expectedHash: current.hash, content: original.content, encoding: "utf8" } });
  }
});


test("builds every union leaf through schema-generated controls without entering JSON", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/studio/");
  await page.getByRole("navigation").getByRole("button", { name: /^Activities/ }).click();
  await page.getByRole("searchbox").fill("gather_wood");
  await page.getByRole("region", { name: "Entity list" }).getByRole("button").filter({ has: page.locator("code", { hasText: /^gather_wood$/ }) }).click();
  await page.getByRole("button", { name: "Add requires", exact: true }).click();
  await page.getByRole("button", { name: "Add effects", exact: true }).click();
  await page.getByRole("button", { name: "Add effects entry", exact: true }).click();
  async function populate(schema: Schema, path: string): Promise<void> {
    if (schema.isOptional()) return;
    const node = unwrap(schema);
    if (node instanceof z.ZodObject) {
      for (const [key, child] of Object.entries(node.shape)) await populate(child as Schema, `${path}.${key}`);
    } else if (node instanceof z.ZodRecord) {
      const container = page.locator(`[data-field="${path}"]`);
      const picker = container.getByRole("combobox", { name: `${path} new key`, exact: true });
      const id = await picker.locator("option").nth(1).getAttribute("value") ?? await picker.locator("option").nth(1).textContent();
      await picker.selectOption(id!);
      await container.getByRole("button", { name: "Add key", exact: true }).click();
      await populate(node.valueSchema, `${path}.${id}`);
    } else if (node instanceof z.ZodArray) {
      const container = page.locator(`[data-field="${path}"]`);
      const checkbox = container.getByRole("checkbox").first();
      if (await checkbox.count()) await checkbox.check();
      else { // roll -> an outcome, with a required weight
        await container.getByRole("button", { name: `Add ${path.split(".").at(-1)} entry`, exact: true }).click();
        await page.getByRole("spinbutton", { name: `${path}.0.weight`, exact: true }).fill("1");
      }
    } else if (node instanceof z.ZodNumber) await page.getByRole("spinbutton", { name: path, exact: true }).fill("1");
    else if (node instanceof z.ZodString || node instanceof z.ZodEnum) {
      const select = page.getByRole("combobox", { name: path, exact: true });
      if (await select.count()) {
        const option = select.locator("option").nth(1);
        await select.selectOption(await option.getAttribute("value") ?? (await option.textContent())!);
      } else await page.getByRole("textbox", { name: path, exact: true }).fill("browser_rule");
    }
  }
  for (const [schema, path] of [[Condition, "requires"], [Effect, "effects.0"]] as const) {
    for (const entry of unionKinds(schema)) {
      if (["all", "any", "not"].includes(entry.kind)) continue; // keyboard scenario owns groups
      await page.getByRole("combobox", { name: `${path} kind`, exact: true }).selectOption(entry.kind);
      await populate(entry.schema, path);
      const widget = page.getByRole("region", { name: `${schema === Condition ? "condition" : "effect"} ${path}`, exact: true });
      await expect(widget.getByRole("alert")).toHaveCount(0);
      await expect(widget).not.toContainText("incomplete");
      await expect(widget.locator(".builder-fallback")).toHaveCount(0);
    }
  }
});

test("area workspace creates and saves a linked activity, renames it, and deletes both after a landmark reference is removed", async ({ page, request }) => {
  test.setTimeout(120_000);
  const inventory = async () => (await (await request.get("/__studio/files")).json()).files as { path: string; content: string; hash: string }[];
  const areaPath = "content/regions/browser_area_seven.json", oldActivity = "content/activities/browser_seven_work.json", newActivity = "content/activities/browser_seven_renamed.json";
  const forestPath = "content/regions/forest.json", originalForest = (await inventory()).find(f => f.path === forestPath)!;
  const nav = page.getByRole("navigation", { name: "Content navigation" });
  const contents = page.getByRole("region", { name: "File contents" });
  try {
    await page.goto("/studio/");
    await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
    await nav.getByRole("button", { name: "+ new area", exact: true }).click();
    const create = page.getByRole("dialog", { name: "Create entity" });
    await create.getByRole("textbox", { name: "id", exact: true }).fill("browser_area_seven");
    await create.getByRole("textbox", { name: "name", exact: true }).fill("temporary area");
    await create.getByRole("textbox", { name: "title", exact: true }).fill("Temporary area");
    await create.getByRole("textbox", { name: "description", exact: true }).fill("You reach a clearing.");
    await create.getByRole("spinbutton", { name: "climate.baseC", exact: true }).fill("15");
    await create.getByRole("spinbutton", { name: "travelHours", exact: true }).fill("1");
    await create.getByRole("button", { name: "Create draft", exact: true }).click();
    await expect(page.locator(".area-workspace")).toBeVisible();
    await contents.getByRole("button", { name: "Map cell 1, 0", exact: true }).click();
    await expect(contents.getByRole("alert")).toContainText("Occupied cell: forest");
    await contents.getByRole("button", { name: "Map cell 2, 1", exact: true }).click();
    await contents.getByRole("button", { name: "Add unlockWhen", exact: true }).click();
    await contents.getByRole("combobox", { name: "unlockWhen kind", exact: true }).selectOption("discovered");
    await contents.getByRole("combobox", { name: "unlockWhen.discovered", exact: true }).selectOption("spring");
    await contents.getByRole("button", { name: "Add explore", exact: true }).click();
    await contents.getByRole("textbox", { name: "explore.name", exact: true }).fill("look around");
    await contents.getByRole("button", { name: "Add view entry", exact: true }).click();
    await contents.getByRole("textbox", { name: "explore.view.0.text", exact: true }).fill("Trees surround a clearing.");
    await contents.getByRole("button", { name: "Add landmark", exact: true }).click();
    await contents.getByRole("textbox", { name: "explore.landmarks.0.id", exact: true }).fill("browser_seven_landmark");
    await contents.getByRole("textbox", { name: "explore.landmarks.0.label", exact: true }).fill("examine the clearing");
    await contents.getByRole("spinbutton", { name: "explore.landmarks.0.hours", exact: true }).fill("1");
    await contents.getByRole("combobox", { name: "explore.landmarks.0.effort", exact: true }).selectOption("light");
    await contents.getByRole("textbox", { name: "explore.landmarks.0.text", exact: true }).fill("You examine the ground.");
    await contents.getByRole("button", { name: "New activity in this area", exact: true }).click();
    await expect(create.getByLabel("Create kind")).toBeDisabled();
    await create.getByRole("textbox", { name: "id", exact: true }).fill("browser_seven_work");
    await create.getByRole("textbox", { name: "name", exact: true }).fill("examine timber");
    await create.getByRole("spinbutton", { name: "hours", exact: true }).fill("1");
    await create.getByRole("combobox", { name: "effort", exact: true }).selectOption("light");
    await create.getByRole("button", { name: "Create draft", exact: true }).click();
    expect((await inventory()).some(f => f.path === oldActivity || f.path === areaPath)).toBe(false);
    await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
    await page.getByRole("button", { name: "Save all", exact: true }).click();
    await expect(page.getByRole("log")).toContainText("Not written: none");
    const saved = await inventory();
    expect(JSON.parse(saved.find(f => f.path === areaPath)!.content).activities).toEqual(["browser_seven_work"]);
    expect(saved.some(f => f.path === oldActivity)).toBe(true);
    await contents.getByRole("button", { name: "Rename id", exact: true }).click();
    const rename = page.getByRole("dialog", { name: "Rename ID" });
    await rename.getByRole("textbox", { name: "New ID", exact: true }).fill("browser_seven_renamed");
    await expect(rename).toContainText("activities.0"); await expect(rename).toContainText("File rename");
    await rename.getByRole("button", { name: "Stage rename", exact: true }).click();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page.getByRole("region", { name: "Entity list" }).getByRole("button").filter({ has: page.locator("code", { hasText: /^browser_seven_work$/ }) }).click();
    await expect(contents.getByRole("textbox", { name: "id", exact: true })).toHaveValue("browser_seven_work");
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    // Open the renamed draft explicitly after history changes selection.
    await page.getByRole("region", { name: "Entity list" }).getByRole("button").filter({ has: page.locator("code", { hasText: /^browser_seven_renamed$/ }) }).click();
    await page.getByRole("button", { name: "Save all", exact: true }).click();
    await expect(page.getByRole("log")).toContainText("new filename exists; old filename absent");
    const renamed = await inventory();
    expect(renamed.some(f => f.path === oldActivity)).toBe(false); expect(renamed.some(f => f.path === newActivity)).toBe(true);
    const beforeArea = JSON.parse(saved.find(f => f.path === areaPath)!.content);
    expect(JSON.parse(renamed.find(f => f.path === areaPath)!.content)).toEqual({ ...beforeArea, activities: ["browser_seven_renamed"] });
    // Reference the temporary landmark from another area's condition builder.
    await nav.getByRole("button", { name: "forest", exact: true }).click();
    await contents.getByRole("combobox", { name: "unlockWhen.discovered", exact: true }).selectOption("browser_seven_landmark");
    await nav.getByRole("button", { name: "browser_area_seven", exact: true }).click();
    await expect(contents.getByRole("region", { name: "Used by Landmark browser_seven_landmark", exact: true })).toContainText("unlockWhen.discovered");
    await contents.getByRole("button", { name: "Remove landmark browser_seven_landmark", exact: true }).click();
    await expect(contents.getByRole("alert")).toContainText("Removal blocked");
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const deletion = page.getByRole("dialog", { name: "Delete entity" });
    await expect(deletion).toContainText("Delete blocked"); await expect(deletion.getByRole("button", { name: "Delete draft" })).toBeDisabled();
    await deletion.getByRole("button", { name: "Close dialog" }).click();
    await nav.getByRole("button", { name: "forest", exact: true }).click();
    await contents.getByRole("combobox", { name: "unlockWhen.discovered", exact: true }).selectOption("forest_edge");
    await nav.getByRole("button", { name: "browser_area_seven", exact: true }).click();
    await page.screenshot({ path: "/tmp/textisland-studio-pr07-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "/tmp/textisland-studio-pr07-phone.png", fullPage: true });
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(deletion.getByRole("region", { name: "Activities left without an area" })).toContainText("browser_seven_renamed");
    await deletion.getByRole("radio", { name: "Delete them too", exact: true }).check();
    await deletion.getByRole("button", { name: "Delete draft", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
    await page.getByRole("button", { name: "Save all", exact: true }).click();
    await expect(page.getByRole("log")).toContainText("Not written: none");
    await expect.poll(async () => (await inventory()).some(f => [areaPath, newActivity, oldActivity].includes(f.path))).toBe(false);
    await nav.getByRole("button", { name: /^Events/ }).click();
    await expect(contents.getByRole("button", { name: "Rename scenes.start", exact: true })).toBeDisabled();
    await expect(contents).toContainText("the engine opens every event at the start scene");
    await nav.getByRole("button", { name: /^Activities/ }).click();
    await page.getByRole("searchbox").fill("sleep");
    await page.getByRole("region", { name: "Entity list" }).getByRole("button").filter({ has: page.locator("code", { hasText: /^sleep$/ }) }).click();
    await expect(contents.getByRole("button", { name: "Rename id", exact: true })).toBeDisabled();
    await expect(contents).toContainText('the engine counts every night\'s sleep under this ID');
    await nav.getByRole("button", { name: /^Game settings/ }).click();
    await page.getByRole("searchbox").fill("stats.json");
    await page.getByRole("region", { name: "Entity list" }).getByRole("button").click();
    for (let index = 0; index < 4; index++) await expect(contents.getByRole("button", { name: `Rename stats.${index}.id`, exact: true })).toBeDisabled();

  } finally {
    const files = await inventory();
    for (const path of [areaPath, oldActivity, newActivity]) {
      const file = files.find(f => f.path === path);
      if (file) expect((await request.delete(`/__studio/files/${path}`, { data: { expectedHash: file.hash } })).ok()).toBe(true);
    }
    const forest = (await inventory()).find(f => f.path === forestPath)!;
    if (forest.content !== originalForest.content) expect((await request.put(`/__studio/files/${forestPath}`, { data: { expectedHash: forest.hash, content: originalForest.content, encoding: "utf8" } })).ok()).toBe(true);
  }
});

test("story filters, graph/list parity, node navigation and all continuation shortcuts use draft dialogs", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/studio/");
  await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
  const nav = page.getByRole("navigation", { name: "Content navigation" });
  await nav.getByRole("button", { name: "Story", exact: true }).click();
  const story = page.getByRole("region", { name: "Story workspace" });
  await story.getByLabel("Story area filter").selectOption("forest");
  await expect(story.locator('.react-flow__node').filter({ hasText: "rabbit_runs" })).toBeVisible();
  await page.screenshot({ path: "/tmp/textisland-studio-story.png", fullPage: true });
  const graphNodes = await story.locator('.react-flow__node').count(), graphEdges = await story.locator('.react-flow__edge').count();
  await story.getByRole("button", { name: "Accessible list view" }).click();
  await expect(story.locator('[data-node]')).toHaveCount(graphNodes);
  await expect(story.locator('[data-edge]')).toHaveCount(graphEdges);
  for (const node of ["discovery:rabbit_runs", "quest:build_snares"]) {
    await story.getByLabel("Story node", { exact: true }).selectOption(node);
    for (const [label, condition] of [["New task when this happens", "trigger"], ["New event when this happens", "trigger"], ["New area unlocked by this", "unlockWhen"]]) {
      await story.getByRole("button", { name: label, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Create entity" });
      await expect(dialog.getByLabel("Create file preview")).toContainText(condition);
      await expect(dialog.getByLabel("Create file preview")).toContainText(node.startsWith("quest") ? '"is": "done"' : '"discovered": "rabbit_runs"');
      await expect(dialog.getByRole("button", { name: "Create draft", exact: true })).toBeDisabled();
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    }
  }
  await story.getByRole("region", { name: "Graph list" }).getByRole("button", { name: /discovery: rabbit_runs/ }).click();
  await expect(page.getByLabel("Area workspace", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "File contents" })).toContainText("Field: explore.landmarks.");
  expect(errors).toEqual([]);
});

test("event graph edits scenes and choices, retargets deletion and flags JSON damage in the temporary pack", async ({ page, request }) => {
  const path = "content/events/shipwreck.json";
  const initial = (await (await request.get("/__studio/files")).json()).files.find((f: { path: string }) => f.path === path);
  try {
    await page.goto("/studio/"); await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
    await page.getByRole("navigation", { name: "Content navigation" }).getByRole("button", { name: /^Events/ }).click();
    const editor = page.getByRole("region", { name: "Event editor" });
    await expect(editor).toBeVisible();
    await editor.getByRole("button", { name: "Add scene", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Add scene", exact: true });
    await dialog.getByLabel("New scene ID", { exact: true }).fill("browser_scene");
    await dialog.getByRole("textbox", { name: "scenes.new_scene.text", exact: true }).fill("You enter a clearing.");
    await dialog.getByRole("textbox", { name: "scenes.new_scene.journal", exact: true }).fill("You enter the clearing.");
    await dialog.getByRole("button", { name: "Add to draft", exact: true }).click();
    await expect(editor.getByRole("region", { name: "Event graph checks" })).toContainText("Unreachable scene: browser_scene");
    await editor.getByRole("button", { name: "Add choice", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Add choice", exact: true });
    await dialog.getByRole("textbox", { name: "scenes.start.choices.new_choice.id", exact: true }).fill("browser_choice");
    await dialog.getByRole("textbox", { name: "scenes.start.choices.new_choice.label", exact: true }).fill("enter the clearing");
    await dialog.getByRole("button", { name: "Add next", exact: true }).click();
    await dialog.getByRole("combobox", { name: "scenes.start.choices.new_choice.next", exact: true }).selectOption("browser_scene");
    await dialog.getByRole("button", { name: "Add to draft", exact: true }).click();
    await expect(editor.getByRole("region", { name: "Event graph checks" })).not.toContainText("Unreachable");
    await page.screenshot({ path: "/tmp/textisland-studio-events.png", fullPage: true });
    await editor.getByLabel("Selected scene", { exact: true }).selectOption("browser_scene");
    await editor.getByRole("button", { name: "Delete scene", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Delete scene", exact: true });
    await expect(dialog).toContainText("Deletion blocked");
    await expect(dialog.getByRole("button", { name: "Retarget and delete scene" })).toBeDisabled();
    await dialog.getByLabel("Retarget incoming choices").selectOption("swim_knife");
    await dialog.getByRole("button", { name: "Retarget and delete scene" }).click();
    await editor.getByRole("button", { name: "Accessible list view" }).click();
    await expect(editor.locator('[data-node="browser_scene"]')).toHaveCount(0);
    await editor.getByRole("button", { name: /start → swim_knife: browser_choice/ }).click();
    await expect(editor.getByRole("textbox", { name: "scenes.start.choices.4.label", exact: true })).toHaveValue("enter the clearing");
    await page.getByRole("button", { name: "Save all", exact: true }).click();
    await expect(page.locator('.save-report')).toContainText("Written:");
    await editor.getByRole("button", { name: "Remove choice browser_choice", exact: true }).click();
    await editor.getByRole("button", { name: "Add choice", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Add choice", exact: true });
    await dialog.getByRole("textbox", { name: "scenes.start.choices.new_choice.id", exact: true }).fill("browser_new_target_choice");
    await dialog.getByRole("textbox", { name: "scenes.start.choices.new_choice.label", exact: true }).fill("follow a new path");
    await dialog.getByRole("checkbox", { name: "Create a new target scene" }).check();
    await dialog.getByLabel("New target scene ID", { exact: true }).fill("browser_new_target");
    await dialog.getByRole("textbox", { name: "scenes.new_target_scene.text", exact: true }).fill("You follow a new path.");
    await dialog.getByRole("textbox", { name: "scenes.new_target_scene.journal", exact: true }).fill("You find a path.");
    await dialog.getByRole("button", { name: "Add to draft", exact: true }).click();
    await expect(editor.locator('[data-node="browser_new_target"]')).toHaveCount(1);
    await editor.getByRole("button", { name: "Remove choice browser_new_target_choice", exact: true }).click();
    await editor.getByLabel("Selected scene", { exact: true }).selectOption("browser_new_target");
    await editor.getByRole("button", { name: "Delete scene", exact: true }).click();
    await page.getByRole("dialog", { name: "Delete scene", exact: true }).getByRole("button", { name: "Delete scene draft", exact: true }).click();
    await page.getByRole("button", { name: "Save all", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
    await page.getByRole("button", { name: "JSON", exact: true }).click();
    const broken = JSON.parse(initial.content); broken.scenes.start.choices[0].next = "missing_browser_scene";
    await page.getByRole("textbox", { name: "JSON document", exact: true }).fill(JSON.stringify(broken));
    await page.getByRole("button", { name: "Form", exact: true }).click();
    await expect(editor.getByRole("region", { name: "Event graph checks" })).toContainText("missing_browser_scene");
    await expect(page.getByRole("button", { name: "Save all", exact: true })).toBeDisabled();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    const current = (await (await request.get("/__studio/files")).json()).files.find((f: { path: string }) => f.path === path);
    expect((await request.put(`/__studio/files/${path}`, { data: { expectedHash: current.hash, content: initial.content, encoding: "utf8" } })).ok()).toBe(true);
  }
});

test("creates and saves a task from a landmark continuation without losing the prefilled condition", async ({ page, request }) => {
  const path = "content/quests/browser_continued_task.json";
  try {
    await page.goto("/studio/"); await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
    await page.getByRole("navigation").getByRole("button", { name: "Story", exact: true }).click();
    const story = page.getByRole("region", { name: "Story workspace" });
    await story.getByRole("button", { name: "Accessible list view" }).click();
    await story.getByRole("button", { name: "Continue the story from discovery:rabbit_runs", exact: true }).click();
    await story.getByRole("button", { name: "New task when this happens", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Create entity" });
    await dialog.getByRole("textbox", { name: "id", exact: true }).fill("browser_continued_task");
    await dialog.getByRole("textbox", { name: "title", exact: true }).fill("inspect the forest");
    await dialog.getByRole("combobox", { name: "completeWhen kind", exact: true }).selectOption("discovered");
    await dialog.getByRole("combobox", { name: "completeWhen.discovered", exact: true }).selectOption("spring");
    await dialog.getByRole("button", { name: "Create draft", exact: true }).click();
    expect((await (await request.get("/__studio/files")).json()).files.some((f: { path: string }) => f.path === path)).toBe(false);
    await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
    await page.getByRole("button", { name: "Save all", exact: true }).click();
    await expect(page.getByRole("log")).toContainText("Not written: none");
    const file = (await (await request.get("/__studio/files")).json()).files.find((f: { path: string }) => f.path === path);
    expect(JSON.parse(file.content).trigger).toEqual({ when: { discovered: "rabbit_runs" } });
  } finally {
    const file = (await (await request.get("/__studio/files")).json()).files.find((f: { path: string }) => f.path === path);
    if (file) expect((await request.delete(`/__studio/files/${path}`, { data: { expectedHash: file.hash } })).ok()).toBe(true);
  }
});

const studioFiles = async (request: import("@playwright/test").APIRequestContext) => (await (await request.get("/__studio/files")).json()).files as { path: string; content: string; hash: string }[];
async function restoreFile(request: import("@playwright/test").APIRequestContext, initial: { path: string; content: string }) {
  const current = (await studioFiles(request)).find(f => f.path === initial.path)!;
  expect((await request.put(`/__studio/files/${initial.path}`, { data: { expectedHash: current.hash, content: initial.content, encoding: "utf8" } })).ok()).toBe(true);
}
test("creation tree: New recipe here, cycle refusal, graph connect and removal with the recipe; story and event graphs cannot connect", async ({ page, request }) => {
  const treePath = "content/trees/crafting.json", recipePath = "content/recipes/browser_pick.json";
  const initial = (await studioFiles(request)).find(f => f.path === treePath)!;
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  try {
    await page.goto("/studio/"); await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
    const nav = page.getByRole("navigation", { name: "Content navigation" });
    await nav.getByRole("button", { name: "Story", exact: true }).click();
    await expect(page.locator(".react-flow__node").first()).toBeVisible();
    await expect(page.locator(".react-flow__handle.connectable")).toHaveCount(0);
    await nav.getByRole("button", { name: /^Events/ }).click();
    await expect(page.locator(".react-flow__handle.connectable")).toHaveCount(0);

    await nav.getByRole("button", { name: "Trees", exact: true }).click();
    const editor = page.getByRole("region", { name: "Creation tree editor" });
    await expect(editor).toContainText("only the prerequisites are authoritative");
    await expect(editor).toContainText("existing saves keep their earned unlocks");
    const nodes = await editor.locator(".react-flow__node").count(), edges = await editor.locator(".react-flow__edge").count();
    expect(nodes).toBe(5); expect(edges).toBe(4);
    await expect(editor.locator(".react-flow__handle.connectable").first()).toBeVisible();
    await editor.getByRole("button", { name: "Accessible list view" }).click();
    await expect(editor.locator("[data-node]")).toHaveCount(nodes); await expect(editor.locator("[data-edge]")).toHaveCount(edges);
    await editor.getByRole("button", { name: "Graph view" }).click();

    await editor.locator('.react-flow__node[data-id="craft_axe"]').click();
    await editor.getByRole("button", { name: "New recipe here", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Create entity" });
    await expect(dialog).toContainText("after craft_axe");
    await dialog.getByRole("textbox", { name: "id", exact: true }).fill("browser_pick");
    await dialog.getByRole("combobox", { name: "item", exact: true }).selectOption("hoe");
    await dialog.getByRole("button", { name: "Add ways entry", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "ways.0.hours", exact: true }).fill("1");
    await dialog.getByRole("combobox", { name: "ways.0.effort", exact: true }).selectOption({ index: 1 });
    await dialog.getByRole("button", { name: "Create draft", exact: true }).click();
    await expect(page.getByText("2 unsaved files")).toBeVisible();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByText("0 unsaved files")).toBeVisible();
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.getByText("2 unsaved files")).toBeVisible();
    await expect(page.getByRole("status").first()).toHaveText("Valid · 0 problems");
    await page.getByRole("button", { name: "Save all", exact: true }).click();
    await expect(page.getByRole("log")).toContainText("Not written: none");
    const saved = JSON.parse((await studioFiles(request)).find(f => f.path === treePath)!.content);
    const expected = JSON.parse(initial.content); expected.nodes.push({ target: "browser_pick", branch: "craft_tools", after: ["craft_axe"], order: 5 });
    expect(saved).toEqual(expected);

    await nav.getByRole("button", { name: "Trees", exact: true }).click();
    await editor.locator('.react-flow__node[data-id="craft_axe"]').click();
    await editor.getByRole("combobox", { name: "Prerequisite to add", exact: true }).selectOption("browser_pick");
    await editor.getByRole("button", { name: "Add prerequisite", exact: true }).click();
    await expect(editor.getByRole("alert")).toContainText("cycle craft_axe → browser_pick → craft_axe");
    await expect(page.getByText("0 unsaved files")).toBeVisible();

    await editor.locator('.react-flow__node[data-id="craft_spear"] .react-flow__handle.source').dragTo(editor.locator('.react-flow__node[data-id="craft_rope"] .react-flow__handle.target'));
    await expect(page.getByText("1 unsaved files")).toBeVisible();
    await editor.getByRole("button", { name: "Accessible list view" }).click();
    await expect(editor.locator('[data-edge="craft_spear/craft_rope"]')).toBeVisible();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByText("0 unsaved files")).toBeVisible();

    await nav.getByRole("button", { name: /^Recipes/ }).click();
    await page.getByRole("button", { name: /browser_pick/ }).first().click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("dialog", { name: "Delete entity" }).getByRole("button", { name: "Delete draft", exact: true }).click();
    await expect(page.getByText("2 unsaved files")).toBeVisible();
    await page.getByRole("button", { name: "Save all", exact: true }).click();
    await expect(page.getByText("0 unsaved files")).toBeVisible();
    expect((await studioFiles(request)).find(f => f.path === treePath)!.content).toBe(initial.content);
    expect((await studioFiles(request)).some(f => f.path === recipePath)).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    const leftover = (await studioFiles(request)).find(f => f.path === recipePath);
    if (leftover) await request.delete(`/__studio/files/${recipePath}`, { data: { expectedHash: leftover.hash } });
    await restoreFile(request, initial);
  }
});

test("creation tree: branches, rename, blocked branch delete and placing an unplaced recipe", async ({ page, request }) => {
  const treePath = "content/trees/crafting.json", recipePath = "content/recipes/browser_loose.json";
  const initial = (await studioFiles(request)).find(f => f.path === treePath)!;
  try {
    await page.goto("/studio/"); await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
    await page.getByRole("navigation").getByRole("button", { name: "Trees", exact: true }).click();
    const editor = page.getByRole("region", { name: "Creation tree editor" });
    await editor.getByLabel("New branch ID", { exact: true }).fill("browser_branch");
    await editor.getByLabel("New branch name", { exact: true }).fill("spare");
    await editor.getByRole("button", { name: "Add branch", exact: true }).click();
    await editor.getByRole("button", { name: "Rename browser_branch…", exact: true }).click();
    const rename = page.getByRole("dialog", { name: "Rename ID" });
    await rename.getByLabel("New ID", { exact: true }).fill("browser_renamed");
    await rename.getByRole("button", { name: "Stage rename", exact: true }).click();
    await page.getByRole("navigation").getByRole("button", { name: "Trees", exact: true }).click();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Create entity" });
    await dialog.getByRole("combobox", { name: "Create kind", exact: true }).selectOption("recipes");
    await dialog.getByRole("textbox", { name: "id", exact: true }).fill("browser_loose");
    await dialog.getByRole("combobox", { name: "item", exact: true }).selectOption("hoe");
    await dialog.getByRole("button", { name: "Add ways entry", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "ways.0.hours", exact: true }).fill("1");
    await dialog.getByRole("combobox", { name: "ways.0.effort", exact: true }).selectOption({ index: 1 });
    await dialog.getByRole("button", { name: "Create draft", exact: true }).click();
    await page.getByRole("navigation").getByRole("button", { name: "Trees", exact: true }).click();
    await expect(editor.getByRole("region", { name: "Not placed yet" })).toContainText("browser_loose");
    await expect(page.getByRole("button", { name: "Save all", exact: true })).toBeDisabled();
    await expect(editor.getByRole("button", { name: "Delete branch craft_tools", exact: true })).toBeDisabled();

    await editor.getByRole("button", { name: "Place browser_loose in tree", exact: true }).click();
    const place = page.getByRole("dialog", { name: "Place in tree" });
    await place.getByRole("combobox", { name: "Branch", exact: true }).selectOption("browser_renamed");
    await place.getByRole("checkbox", { name: "craft_rope" }).check();
    await place.getByRole("button", { name: "Place in tree", exact: true }).click();
    await expect(editor.getByRole("region", { name: "Not placed yet" })).toContainText("Every recipe has a node");
    await expect(editor.getByRole("region", { name: "Branches" })).toContainText("Used by 1 node");
    await expect(page.getByRole("status").first()).toHaveText("Valid · 0 problems");
    await page.getByRole("button", { name: "Save all", exact: true }).click();
    await expect(page.getByText("0 unsaved files")).toBeVisible();
    const expected = JSON.parse(initial.content);
    expected.branches.push({ id: "browser_renamed", name: "spare", order: 3 });
    expected.nodes.push({ target: "browser_loose", branch: "browser_renamed", after: ["craft_rope"], order: 5 });
    expect(JSON.parse((await studioFiles(request)).find(f => f.path === treePath)!.content)).toEqual(expected);
  } finally {
    await restoreFile(request, initial);
    const leftover = (await studioFiles(request)).find(f => f.path === recipePath);
    if (leftover) await request.delete(`/__studio/files/${recipePath}`, { data: { expectedHash: leftover.hash } });
  }
});

test("map editor moves areas by drag and keyboard, refuses occupied cells, cancels with Escape and shows travelHours diagnostics", async ({ page, request }) => {
  const paths = ["content/regions/forest.json", "content/regions/meadows.json"];
  const initial = (await studioFiles(request)).filter(f => paths.includes(f.path));
  const read = async (path: string) => JSON.parse((await studioFiles(request)).find(f => f.path === path)!.content);
  try {
    await page.goto("/studio/"); await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
    await page.getByRole("navigation").getByRole("button", { name: "Map", exact: true }).click();
    const map = page.getByRole("region", { name: "Map editor" });
    await expect(map.getByRole("button", { name: /^Area (beach|forest|meadows)$/ })).toHaveCount(3);
    await expect(map.locator('[data-cell="0,0"]')).toContainText("camp");
    await expect(map.getByLabel("Paths from camp")).toContainText("beach → forest: 0.5 h");
    await map.getByRole("button", { name: "Area forest", exact: true }).dragTo(map.locator('[data-cell="0,0"]'));
    await expect(map.getByRole("alert")).toContainText("occupied by beach");
    await expect(page.getByText("0 unsaved files")).toBeVisible();
    await map.getByRole("button", { name: "Area forest", exact: true }).dragTo(map.locator('[data-cell="1,1"]'));
    await expect(page.getByText("1 unsaved files")).toBeVisible();

    const meadows = map.getByRole("button", { name: "Area meadows", exact: true });
    await meadows.focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
    await expect(map.locator('[data-cell="-1,2"]')).toContainText("Move meadows here");
    await page.keyboard.press("Escape");
    await expect(map.getByText("Move meadows here")).toHaveCount(0);
    await expect(page.getByText("1 unsaved files")).toBeVisible();
    await meadows.focus(); await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(map.getByRole("alert")).toContainText("occupied by beach");
    await meadows.focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
    await expect(page.getByText("2 unsaved files")).toBeVisible();
    await expect(map.locator('[data-cell="-1,1"]')).toContainText("meadows");

    await map.getByLabel("travelHours forest", { exact: true }).fill("0.3");
    await expect(map.getByRole("alert").filter({ hasText: "travelHours" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Save all", exact: true })).toBeDisabled();
    await map.getByLabel("travelHours forest", { exact: true }).fill("0.5");
    await expect(page.getByRole("status").first()).toHaveText("Valid · 0 problems");
    await page.getByRole("button", { name: "Save all", exact: true }).click();
    await expect(page.getByText("0 unsaved files")).toBeVisible();
    const forest = JSON.parse(initial[0].content), meadowsRaw = JSON.parse(initial[1].content);
    forest.map = { x: 1, y: 1 }; meadowsRaw.map = { x: -1, y: 1 };
    expect(await read(paths[0])).toEqual(forest); expect(await read(paths[1])).toEqual(meadowsRaw);
    await map.getByRole("button", { name: "Area forest", exact: true }).click();
    await expect(page.getByLabel("Area workspace", { exact: true })).toBeVisible();
  } finally {
    for (const file of initial) await restoreFile(request, file);
  }
});

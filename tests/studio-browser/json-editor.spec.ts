import { expect, test, type Page } from "@playwright/test";
import { formatContent } from "../../src/content";
import { cursorLine, editorText, placeCursor, setEditorText } from "./editor";

async function open(page: Page, kind: RegExp, id: string) {
  await page.goto("/studio/");
  await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
  await page.getByRole("navigation", { name: "Content navigation" }).getByRole("button", { name: kind }).click();
  await page.getByRole("region", { name: "Entity list" }).getByRole("button").filter({ has: page.locator("code", { hasText: new RegExp(`^${id}$`) }) }).click();
}
const jsonButton = (page: Page) => page.getByRole("button", { name: "JSON", exact: true });
const formButton = (page: Page) => page.getByRole("button", { name: "Form", exact: true });
const editor = (page: Page) => page.getByRole("textbox", { name: "JSON document", exact: true });
const lintLine = (page: Page, selector: string) => page.locator(selector).first().evaluate((element) => element.closest(".cm-line")!.textContent);

test("opens settings in JSON and other kinds in Form, and remembers the last choice per file", async ({ page }) => {
  await open(page, /^Game settings/, "game");
  await expect(editor(page)).toBeVisible();
  await expect(jsonButton(page)).toHaveAttribute("aria-pressed", "true");
  await formButton(page).click();
  await expect(editor(page)).toHaveCount(0);
  await page.reload();
  await page.getByRole("navigation", { name: "Content navigation" }).getByRole("button", { name: /^Game settings/ }).click();
  await page.getByRole("region", { name: "Entity list" }).getByRole("button").filter({ has: page.locator("code", { hasText: /^game$/ }) }).click();
  await expect(formButton(page)).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("region", { name: "Entity list" }).getByRole("button").filter({ has: page.locator("code", { hasText: /^stats$/ }) }).click();
  await expect(editor(page)).toBeVisible();
  await page.getByRole("navigation", { name: "Content navigation" }).getByRole("button", { name: /^Items/ }).click();
  await page.getByRole("region", { name: "Entity list" }).getByRole("button").filter({ has: page.locator("code", { hasText: /^knife$/ }) }).click();
  await expect(formButton(page)).toHaveAttribute("aria-pressed", "true");
  await expect(editor(page)).toHaveCount(0);
  await jsonButton(page).click();
  await expect(editor(page)).toBeVisible();
  await page.reload();
  await page.getByRole("navigation", { name: "Content navigation" }).getByRole("button", { name: /^Items/ }).click();
  await page.getByRole("region", { name: "Entity list" }).getByRole("button").filter({ has: page.locator("code", { hasText: /^knife$/ }) }).click();
  await expect(editor(page)).toBeVisible();
});

test("shows syntax and registry errors on their lines and blocks Save", async ({ page }) => {
  await open(page, /^Activities/, "gather_wood");
  await jsonButton(page).click();
  const raw = JSON.parse(await editorText(page));
  raw.requires = { item: "missing_browser_test_item" };
  await setEditorText(page, JSON.stringify(raw, null, 2) + "\n");
  await expect(page.locator(".cm-lintRange-error")).toHaveText('"missing_browser_test_item"');
  expect(await lintLine(page, ".cm-lintRange-error")).toContain('"item": "missing_browser_test_item"');
  await expect(page.locator(".cm-lint-marker-error").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Save all" })).toBeDisabled();
  await expect(page.getByRole("region", { name: "Diagnostics" })).toContainText('unknown item "missing_browser_test_item"');

  await setEditorText(page, '{\n  "id": "gather_wood"\n  "hours": 1\n}\n');
  await expect(page.locator(".cm-lintRange-error")).toHaveCount(1);
  expect(await lintLine(page, ".cm-lintRange-error")).toContain('"hours": 1');
  await page.waitForTimeout(400);
  await page.mouse.move(0, 0);
  await page.locator(".cm-lintRange-error").hover();
  await page.mouse.move(2, 2);
  await page.locator(".cm-lintRange-error").hover();
  await expect(page.locator(".cm-tooltip-lint")).toContainText("Invalid JSON");
  await expect(page.getByRole("button", { name: "Save all" })).toBeDisabled();

  await setEditorText(page, '{\n  "id": "gather_wood",\n  "hours": 1,\n  "hours": 2\n}\n');
  await expect(page.locator(".cm-lintRange-error")).toHaveText('"hours"');
  expect(await lintLine(page, ".cm-lintRange-error")).toContain('"hours": 2');
  await expect(page.getByRole("button", { name: "Save all" })).toBeDisabled();
});

test("completes keys, enums and existing IDs from the schema", async ({ page }) => {
  await open(page, /^Activities/, "gather_wood");
  await jsonButton(page).click();
  const options = page.locator(".cm-tooltip-autocomplete li");
  await setEditorText(page, '{\n  "id": "gather_wood",\n  \n}\n');
  await placeCursor(page, '"gather_wood",\n  ', '"gather_wood",\n  '.length);
  await page.keyboard.press("Control+Space");
  await expect(options.filter({ hasText: '"hours"' })).toBeVisible();
  await expect(options.filter({ hasText: '"id"' })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await setEditorText(page, '{\n  "effort": \n}\n');
  await placeCursor(page, '"effort": ', '"effort": '.length);
  await page.keyboard.press("Control+Space");
  await expect(options.filter({ hasText: '"heavy"' })).toBeVisible();
  await page.waitForTimeout(200); // CodeMirror ignores accept keys right after the list opens
  await page.keyboard.press("Enter");
  expect(await editorText(page)).toContain('"effort": "heavy"');

  await setEditorText(page, '{\n  "requires": { "item": "" }\n}\n');
  await placeCursor(page, '"item": "', '"item": "'.length);
  await page.keyboard.press("Control+Space");
  await expect(options.filter({ hasText: '"knife"' })).toBeVisible();
  await page.keyboard.type("kni");
  await expect(options.first()).toContainText('"knife"');
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  expect(await editorText(page)).toBe('{\n  "requires": { "item": "knife" }\n}\n');
});

test("Cmd/Ctrl+Z in the editor undoes one editor step and never the Studio history", async ({ page }) => {
  await open(page, /^Items/, "knife");
  await jsonButton(page).click();
  const original = await editorText(page);
  await placeCursor(page, "{", 0);
  await page.keyboard.type("a");
  await page.waitForTimeout(700);
  await page.keyboard.type("b");
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => editorText(page)).toBe("a" + original);
  await page.waitForTimeout(900);
  expect(await editorText(page)).toBe("a" + original);
  await expect(page.getByText("1 unsaved files")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => editorText(page)).toBe(original);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => editorText(page)).toBe("a" + original);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => editorText(page)).toBe(original);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(() => editorText(page)).toBe("a" + original);
});

test("saves a minimal house-format diff of game.json, keeps comments, and keeps the cursor on its JSON path", async ({ page, request }) => {
  const path = "content/game.json";
  const read = async () => (await (await request.get("/__studio/files")).json()).files.find((f: { path: string }) => f.path === path) as { content: string; hash: string };
  const before = await read();
  try {
    await open(page, /^Game settings/, "game");
    const base = formatContent(JSON.parse(before.content));
    const edited = base.replace('"stepMinutes": 15', '"stepMinutes":    15').replace("Global game settings", "Global settings");
    await setEditorText(page, edited);
    await placeCursor(page, '"stepMinutes":    15', 8);
    const save = page.getByRole("button", { name: "Save all" });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
    await expect(page.getByText("0 unsaved files")).toBeVisible();
    const after = await read();
    const was = base.split("\n"), now = after.content.split("\n");
    expect(now).toHaveLength(was.length);
    expect(now.filter((line, i) => line !== was[i])).toEqual([was.find((line) => line.includes('"_note"'))!.replace("Global game settings", "Global settings")]);
    expect(now.some((line) => line.includes('"_sleep"'))).toBe(true);
    await expect.poll(() => editorText(page)).toBe(after.content);
    expect(await cursorLine(page)).toContain('"stepMinutes": 15');
  } finally {
    const current = await read();
    expect((await request.put(`/__studio/files/${path}`, { data: { expectedHash: current.hash, content: before.content, encoding: "utf8" } })).ok()).toBe(true);
  }
});

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type Stored = { path: string; content: string; hash: string };
const files = async (request: APIRequestContext) => (await (await request.get("/__studio/files")).json()).files as Stored[];
const layoutFile = async (request: APIRequestContext) => (await files(request)).find(f => f.path === "studio-layout/story.json");
const pins = async (request: APIRequestContext) => { const f = await layoutFile(request); return f ? JSON.parse(f.content).pins as Record<string, { x: number; y: number }> : undefined; };
/** Puts the temporary pack back exactly as it was, including a rename's moved file and the layout file. */
async function restore(request: APIRequestContext, initial: Stored[]) {
  const current = await files(request), original = new Map(initial.map(f => [f.path, f]));
  for (const file of current) if (!original.has(file.path)) expect((await request.delete(`/__studio/files/${file.path}`, { data: { expectedHash: file.hash } })).ok()).toBe(true);
  for (const file of initial) {
    const now = current.find(f => f.path === file.path);
    if (now?.content === file.content) continue;
    expect((await request.put(`/__studio/files/${file.path}`, { data: { expectedHash: now?.hash ?? null, content: file.content, encoding: "utf8" } })).ok()).toBe(true);
  }
}
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const position = (page: Page, id: string) => node(page, id).evaluate(el => { const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec((el as HTMLElement).style.transform)!; return { x: Math.round(+m[1]), y: Math.round(+m[2]) }; });
async function drag(page: Page, id: string, dx: number, dy: number) {
  const box = (await node(page, id).boundingBox())!, x = box.x + 24, y = box.y + 14;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 10 }); await page.mouse.up();
}
async function openStory(page: Page) {
  await page.goto("/studio/");
  await expect(page.getByRole("status").first()).toHaveText("Valid · 0 problems");
  await page.getByRole("navigation", { name: "Content navigation" }).getByRole("button", { name: "Story", exact: true }).click();
  const story = page.getByRole("region", { name: "Story workspace" });
  await expect(story.locator(".react-flow__node").first()).toBeVisible();
  return story;
}

test("focus, edge filter, grouping, search and layout options work in the graph and mirror in the list", async ({ page, request }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const story = await openStory(page);
  const total = await story.locator(".react-flow__node").count();
  const edges = () => story.locator(".react-flow__edge").count();
  // (a) focus a landmark and follow its chain
  await node(page, "discovery:cliff_shells").click({ position: { x: 24, y: 14 } });
  await expect(story.getByText("Focus: discovery:cliff_shells · 2 nodes")).toBeVisible();
  await expect(story.locator(".story-node.is-dimmed")).toHaveCount(total - 2);
  await expect(story.locator(".story-node.is-dimmed").first()).toHaveCSS("pointer-events", "none");
  await story.getByLabel("Focus depth").selectOption("2");
  await expect(story.getByText("Focus: discovery:cliff_shells · 3 nodes")).toBeVisible();
  await expect(node(page, "discovery:cliff_top")).not.toHaveClass(/is-dimmed/);
  // the list shows the same: out-of-focus entries are disabled
  await story.getByRole("button", { name: "Accessible list view" }).click();
  await expect(story.locator("li[data-node].is-dimmed")).toHaveCount(total - 3);
  await expect(story.locator('li[data-node="region:beach"] button').first()).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(story.getByText(/^Focus: /)).toHaveCount(0);
  await expect(story.locator("li[data-node].is-dimmed")).toHaveCount(0);
  await story.getByRole("region", { name: "Graph list" }).getByRole("button", { name: /^discovery: rabbit_runs/ }).click();
  await expect(story.getByText(/^Focus: discovery:rabbit_runs/)).toBeVisible();
  await expect(page.getByLabel("Area workspace", { exact: true })).toHaveCount(0); // select, not open
  await story.getByRole("button", { name: "Show all", exact: true }).click();
  await expect(story.getByText(/^Focus: /)).toHaveCount(0);
  await story.getByRole("button", { name: "Graph view" }).click();
  // (b) story edges only, then all references; group by area
  const drivingEdges = await edges();
  await story.getByLabel("Show all references").check();
  await expect.poll(edges).toBeGreaterThan(drivingEdges);
  await story.getByLabel("Show all references").uncheck();
  await expect.poll(edges).toBe(drivingEdges);
  await story.getByLabel("Group by area").check();
  await expect(story.locator(".story-group")).toHaveCount(3);
  await expect(story.locator(".story-group-label").filter({ hasText: "forest" })).toBeVisible();
  await story.getByLabel("Story direction").selectOption("TB");
  await story.getByLabel("Story spacing").selectOption("wide");
  await story.getByRole("button", { name: "Re-arrange" }).click();
  // options persist for this viewer
  await page.reload();
  await page.getByRole("navigation", { name: "Content navigation" }).getByRole("button", { name: "Story", exact: true }).click();
  await expect(story.getByLabel("Group by area")).toBeChecked();
  await expect(story.getByLabel("Story direction")).toHaveValue("TB");
  await expect(story.getByLabel("Story spacing")).toHaveValue("wide");
  await expect(story.getByLabel("Show all references")).not.toBeChecked();
  await story.getByLabel("Group by area").uncheck();
  // search centres and selects
  await story.getByLabel("Find a node").fill("cliff_top");
  await story.getByLabel("Find a node").press("Enter");
  await expect(story.getByText(/^Focus: discovery:cliff_top/)).toBeVisible();
  await expect(node(page, "discovery:cliff_top")).toHaveClass(/is-selected/);
  await expect.poll(async () => {
    const [n, canvas] = [await node(page, "discovery:cliff_top").boundingBox(), await story.locator(".flow-canvas").boundingBox()];
    return Math.hypot(n!.x + n!.width / 2 - (canvas!.x + canvas!.width / 2), n!.y + n!.height / 2 - (canvas!.y + canvas!.height / 2));
  }).toBeLessThan(80);
  // double-click opens the entity
  await node(page, "discovery:cliff_top").dblclick({ position: { x: 24, y: 14 } });
  await expect(page.getByLabel("Area workspace", { exact: true })).toBeVisible();
  expect(await layoutFile(request)).toBeUndefined();
  expect(errors).toEqual([]);
});

test("dragged nodes are pinned, saved without Save all, survive a reload, can be unpinned or reset, and follow a rename", async ({ page, request }) => {
  const initial = await files(request);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  try {
    const story = await openStory(page);
    const ids = ["discovery:cliff_shells", "discovery:rabbit_runs", "quest:climb_cliff"];
    // (c) drag three nodes and wait for the autosave
    for (const [i, id] of ids.entries()) {
      const before = await position(page, id);
      await drag(page, id, 30 + i * 20, 50);
      await expect.poll(async () => (await position(page, id)).y).not.toBe(before.y);
      await expect.poll(async () => Object.keys((await pins(request)) ?? {})).toContain(id);
      await expect(story.locator(".layout-status")).toHaveText("Layout saved");
    }
    await expect(story.locator(".story-node.is-pinned")).toHaveCount(3);
    const saved = await pins(request);
    expect(Object.keys(saved!).sort()).toEqual([...ids].sort());
    // the layout is not a content draft: nothing to save, no unsaved marker, content still valid
    await expect(page.getByRole("button", { name: "Save all", exact: true })).toBeDisabled();
    const shown = Object.fromEntries(await Promise.all(ids.map(async id => [id, await position(page, id)])));
    expect(shown).toEqual(saved);
    await page.reload();
    await page.getByRole("navigation", { name: "Content navigation" }).getByRole("button", { name: "Story", exact: true }).click();
    await expect(story.locator(".story-node.is-pinned")).toHaveCount(3);
    for (const id of ids) expect(await position(page, id)).toEqual(saved![id]);
    expect((await layoutFile(request))!.content).toMatch(/^\{\n {2}"version": 1,\n {2}"pins": \{\n {4}"discovery:cliff_shells": \{ "x": -?\d+, "y": -?\d+ \}/);
    // Unpin one node from its own button
    await node(page, "discovery:rabbit_runs").getByRole("button", { name: "Unpin discovery:rabbit_runs" }).click();
    await expect(story.locator(".layout-status")).toHaveText("Layout saved");
    await expect.poll(async () => Object.keys((await pins(request))!).sort()).toEqual(["discovery:cliff_shells", "quest:climb_cliff"]);

    // (d) rename a pinned task: the pin follows, in the same save as the content
    await story.getByLabel("Story node", { exact: true }).selectOption("quest:climb_cliff");
    await story.getByRole("button", { name: "Open entity", exact: true }).click();
    const contents = page.getByRole("region", { name: "File contents" });
    await contents.getByRole("button", { name: "Rename id", exact: true }).click();
    const rename = page.getByRole("dialog", { name: "Rename ID" });
    await rename.getByRole("textbox", { name: "New ID", exact: true }).fill("climb_the_cliff");
    await rename.getByRole("button", { name: "Stage rename", exact: true }).click();
    await page.getByRole("navigation", { name: "Content navigation" }).getByRole("button", { name: "Story", exact: true }).click();
    await expect(node(page, "quest:climb_the_cliff")).toBeVisible();
    expect(await position(page, "quest:climb_the_cliff")).toEqual(saved!["quest:climb_cliff"]);
    expect(Object.keys((await pins(request))!)).toContain("quest:climb_cliff"); // not written before the content save
    await page.getByRole("button", { name: "Save all", exact: true }).click();
    await expect(page.getByRole("log")).toContainText("Not written: none");
    await expect.poll(async () => Object.keys((await pins(request))!).sort()).toEqual(["discovery:cliff_shells", "quest:climb_the_cliff"]);
    expect((await pins(request))!["quest:climb_the_cliff"]).toEqual(saved!["quest:climb_cliff"]);
    await page.reload();
    await page.getByRole("navigation", { name: "Content navigation" }).getByRole("button", { name: "Story", exact: true }).click();
    expect(await position(page, "quest:climb_the_cliff")).toEqual(saved!["quest:climb_cliff"]);

    // Reset layout asks first, then clears every pin
    await story.getByRole("button", { name: "Reset layout" }).click();
    await story.getByRole("group", { name: "Confirm reset layout" }).getByRole("button", { name: "Cancel" }).click();
    expect(Object.keys((await pins(request))!)).toHaveLength(2);
    await story.getByRole("button", { name: "Reset layout" }).click();
    await story.getByRole("button", { name: "Clear pins" }).click();
    await expect.poll(async () => await pins(request)).toEqual({});
    await expect(story.locator(".story-node.is-pinned")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await restore(request, initial); }
});

test("a layout write failure is shown and can be retried", async ({ page, request }) => {
  const initial = await files(request);
  try {
    const story = await openStory(page);
    let fail = true;
    await page.route("**/__studio/files/studio-layout/story.json", route => fail && route.request().method() === "PUT" ? route.fulfill({ status: 500, json: { error: "disk full" } }) : route.continue());
    await drag(page, "discovery:cliff_shells", 40, 40);
    await expect(story.locator(".layout-status")).toHaveText("Layout save failed – retry");
    expect(await layoutFile(request)).toBeUndefined();
    fail = false;
    await story.getByRole("button", { name: "Layout save failed – retry" }).click();
    await expect(story.locator(".layout-status")).toHaveText("Layout saved");
    expect(Object.keys((await pins(request))!)).toEqual(["discovery:cliff_shells"]);
  } finally { await restore(request, initial); }
});

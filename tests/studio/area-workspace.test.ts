import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, expect, it } from "vitest";
import { StudioStore } from "../../src/studio/store";
import { AreaWorkspace } from "../../src/studio/area-workspace";
import { schemaFor } from "../../src/studio/schema";
import { deletionReferences } from "../../src/studio/references";

const STUDIO_ROOT = mkdtempSync(join(tmpdir(), "studio-area-"));
cpSync(new URL("../fixtures/content", import.meta.url), join(STUDIO_ROOT, "content"), { recursive: true });
afterAll(() => rmSync(STUDIO_ROOT, { recursive: true, force: true }));
function setup() {
  const store = new StudioStore();
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else store.disk.push({ path: relative(STUDIO_ROOT, path), content: readFileSync(path, "utf8"), hash: name, encoding: "utf8" });
    }
  }
  walk(join(STUDIO_ROOT, "content")); return store;
}
function temporaryArea(store: StudioStore) {
  return store.create("regions", { id: "temporary_area", name: "temporary area", title: "Temporary area", description: "A place.", climate: { baseC: 15 }, travelHours: 1, activities: [], explore: { name: "look around", view: [{ text: "A view." }], landmarks: [{ id: "temporary_landmark", label: "examine", hours: 1, effort: "light", text: "A landmark." }] } });
}
it("round-trips every fixture area unchanged through the workspace and existing widgets", () => {
  const store = setup(), before = structuredClone(store.files), documents = store.view.documents;
  for (const owner of documents.filter(d => d.kind === "regions")) {
    const html = renderToStaticMarkup(createElement(AreaWorkspace, { schema: schemaFor(owner.path)!, value: owner.raw, path: "", lockId: true, documents, owner, problems: [], onError: () => {}, onChange: () => { throw new Error("Rendering must not edit"); }, open: () => {}, newActivity: () => {} }));
    for (const label of ["Properties", "Map and unlock", "Text and exploration", "Linked activities", "Global activities offered here", "Map cell picker", "Existing activity"]) expect(html).toContain(label);
    expect(html).toContain('aria-label="id"'); expect(html).toContain("readOnly");
    store.edit(owner.path, owner.raw); expect(store.drafts.size).toBe(0);
  }
  expect(store.files).toEqual(before);
});
it("creates the activity and explicit area link in one undo step", () => {
  const store = setup(), path = temporaryArea(store), steps = store.past.length;
  const activity = store.createInArea(path, "activities", { id: "temporary_activity", name: "temporary activity", hours: 1, effort: "light" });
  expect(store.past).toHaveLength(steps + 1); expect(store.view.diagnostics).toEqual([]);
  expect(store.drafts.has(path)).toBe(true); expect(store.drafts.has(activity)).toBe(true);
  store.undo(); expect(store.view.documents.some(d => d.path === activity)).toBe(false);
  expect((store.view.documents.find(d => d.path === path)!.raw as { activities: string[] }).activities).toEqual([]);
  store.redo(); expect(store.view.diagnostics).toEqual([]);
});
it("keeps orphan activities until linked elsewhere or deletes the area and its orphan activities together", () => {
  const store = setup(), path = temporaryArea(store);
  const activity = store.createInArea(path, "activities", { id: "temporary_activity", name: "temporary activity", hours: 1, effort: "light" });
  expect(store.orphanActivities(path).map(d => d.path)).toEqual([activity]);
  store.delete(path); expect(store.canSave).toBe(false);
  const forest = store.view.documents.find(d => d.id === "forest")!;
  store.edit(forest.path, { ...forest.raw as object, activities: [...(forest.raw as { activities: string[] }).activities, "temporary_activity"] });
  expect(store.canSave).toBe(true);
  store.undo(); store.undo();
  store.delete(path, true); expect(store.view.diagnostics).toEqual([]);
  expect(store.view.documents.some(d => [path, activity].includes(d.path))).toBe(false);
  store.undo(); expect(store.view.documents.some(d => d.path === path)).toBe(true); expect(store.view.documents.some(d => d.path === activity)).toBe(true);
});
it("does not delete globals, shared activities or externally referenced activities with the area", () => {
  const store = setup(), path = temporaryArea(store);
  const activity = store.createInArea(path, "activities", { id: "temporary_activity", name: "temporary activity", hours: 1, effort: "light" });
  const forest = store.view.documents.find(d => d.id === "forest")!;
  store.edit(forest.path, { ...forest.raw as object, unlockWhen: { did: "temporary_activity" } });
  expect(() => store.delete(path, true)).toThrow("referenced");
  expect(store.view.documents.some(d => d.path === path)).toBe(true);
  store.undo();
  store.edit(forest.path, { ...forest.raw as object, activities: [...(forest.raw as { activities: string[] }).activities, "temporary_activity"] });
  expect(store.orphanActivities(path)).toEqual([]);
  store.delete(path, true); expect(store.view.documents.some(d => d.path === activity)).toBe(true); expect(store.view.diagnostics).toEqual([]);
});
it("blocks area deletion and landmark removal with exact incoming file/field references", () => {
  const store = setup(), path = temporaryArea(store);
  const forest = store.view.documents.find(d => d.id === "forest")!;
  store.edit(forest.path, { ...forest.raw as object, unlockWhen: { discovered: "temporary_landmark" } });
  const area = store.view.documents.find(d => d.path === path)!;
  expect(deletionReferences(store.view.documents, area, "explore.landmarks.0")).toContainEqual(expect.objectContaining({ file: forest.path, path: "unlockWhen.discovered" }));
  expect(() => store.delete(path)).toThrow("referenced");
});

import { FormContext, type FieldProps, type FormContextValue } from "../../src/studio/form";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createElement, type ComponentType } from "react";
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
    const html = renderToStaticMarkup(formElement(AreaWorkspace, { schema: schemaFor(owner.path)!, value: owner.raw, path: "", lockId: true, documents, owner, problems: [], onError: () => {}, onChange: () => { throw new Error("Rendering must not edit"); }, open: () => {}, newActivity: () => {} }));
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


it("renders forest cards, editable root notes and landmark hints without double-counting diagnostics", () => {
  const store = setup(), documents = store.view.documents, owner = documents.find(d => d.kind === "regions" && d.id === "forest")!;
  const value = { ...owner.raw as object, _arrive: "Return note", _explore: "Look note", _note: "General note", _raw: { keep: true } };
  const render = (raw: unknown, path: string) => renderToStaticMarkup(formElement(AreaWorkspace, { schema: schemaFor(owner.path)!, value: raw, path: "", lockId: true, documents, owner, problems: [{ file: owner.path, path, message: "Test diagnostic" }], onError: () => {}, onChange: () => { throw new Error("Rendering must not edit"); }, open: () => {}, newActivity: () => {} }));
  const html = render(value, "explore.landmarks.0.hours");
  expect([...html.matchAll(/<strong>([^<]+)<\/strong>/g)].map(match => match[1])).toEqual(["Properties", "Map and unlock", "Text and exploration", "Landmarks", "Linked activities"]);
  for (const label of ["Travel from camp", "0 = the camp", "Unlocked when", "On return", "Button", "Duration &amp; effort", "Offered when", "Discovery passage", "Journal line"]) expect(html).toContain(label);
  expect(html).toContain('class="field-unit">h</span>');
  for (const [note, field] of [["_map", "map"], ["_arrive", "arrive"], ["_explore", "explore.name"]]) expect(html.indexOf(`aria-label="${note}"`)).toBeLessThan(html.indexOf(`data-field="${field}"`));
  expect(html.indexOf('aria-label="_note"')).toBeLessThan(html.indexOf('data-field="id"'));
  expect(html).toContain('<summary>_raw</summary>');
  expect(html).not.toContain('landmark-entry');
  expect(html).toContain('class="add-link" type="button" aria-label="Add landmark">+ add landmark</button>');
  const forest = owner.raw as { explore: { landmarks: { id: string }[] } };
  expect(html).toContain('<section class="area-workspace" aria-label="Area workspace">');
  expect(html).not.toContain("Used by");
  for (const landmark of forest.explore.landmarks) {
    expect(html).toContain(`aria-label="Landmark ${landmark.id}"`);
    expect(html).toContain(`aria-label="Remove landmark ${landmark.id}">×</button>`);
    expect(html).toContain(`aria-label="Move up landmark ${landmark.id}"`);
    expect(html).toContain(`aria-label="Move down landmark ${landmark.id}"`);
  }
  const textCard = html.split('<strong>Text and exploration</strong>')[1].split('<strong>Landmarks</strong>')[0];
  const landmarkCard = html.split('<strong>Landmarks</strong>')[1].split('<strong>Linked activities</strong>')[0];
  expect(textCard).not.toContain('form-section-problems');
  expect(landmarkCard).toContain('form-section-problems">1 problem');
  for (const path of ["explore.landmarks", "activities", "activities.0"]) expect(render(value, path).match(/form-section-problems/g)).toHaveLength(1);
  const without = { ...value, explore: undefined };
  const empty = render(without, "explore.name");
  expect(empty).not.toContain('<strong>Landmarks</strong>');
  expect(empty).toContain('aria-label="Add explore"');
});


it("groups unset area fields into one trailing Optional line per card and preserves entry control names", () => {
  const store = setup(), documents = store.view.documents, owner = documents.find(d => d.kind === "regions" && d.id === "forest")!;
  const value = { id: "forest", name: "forest", title: "Forest", description: "Trees.", climate: { baseC: 18 }, travelHours: 1, activities: ["gather_wood"], _artwork: "Art note", _explore: "Explore note" };
  const html = renderToStaticMarkup(formElement(AreaWorkspace, { schema: schemaFor(owner.path)!, value, path: "", documents, owner, problems: [], onError: () => {}, onChange: () => { throw new Error("Rendering must not edit"); }, open: () => {}, newActivity: () => {} }));
  expect(html.match(/class="optional-fields"/g)).toHaveLength(3);
  for (const [title, next, keys] of [
    ["Properties", "Map and unlock", ["artwork", "siteCapabilities", "order", "shelterWhen"]],
    ["Map and unlock", "Text and exploration", ["map", "unlockWhen", "hintWhen"]],
    ["Text and exploration", "Linked activities", ["firstVisit", "arrive", "explore"]],
  ] as const) {
    const card = html.split(`<strong>${title}</strong>`)[1].split(`<strong>${next}</strong>`)[0];
    expect(card.match(/class="optional-fields"/g)).toHaveLength(1);
    const [fields, optional] = card.split('class="optional-fields"');
    expect(fields).not.toContain('class="optional-chip"');
    expect(optional).toContain('<span>Optional:</span>');
    for (const key of keys) {
      expect(optional).toContain(`aria-label="Add ${key}"`);
      expect(fields).not.toContain(`data-field="${key}"`);
    }
    if (title === "Properties") expect(optional.indexOf('aria-label="_artwork"')).toBeLessThan(optional.indexOf('aria-label="Add artwork"'));
    if (title === "Text and exploration") expect(optional.indexOf('aria-label="_explore"')).toBeLessThan(optional.indexOf('aria-label="Add explore"'));
  }
  expect(html).toContain('class="entry-actions"><button type="button" aria-label="Move up activity gather_wood"');
  expect(html).toContain('aria-label="Unlink gather_wood">×</button>');
});

function formElement<P extends FieldProps>(component: ComponentType<P>, props: P & FormContextValue) {
  const { documents, owner, problems, buffers, onError, requiredOnly, lockId, ...field } = props;
  return createElement(FormContext.Provider, { value: { documents, owner, problems, buffers, onError, requiredOnly, lockId } },
    createElement(component, field as unknown as P));
}

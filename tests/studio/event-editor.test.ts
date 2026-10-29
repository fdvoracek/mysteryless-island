import { FormContext, type FieldProps, type FormContextValue } from "../../src/studio/form";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, expect, it } from "vitest";
import { formatContent } from "../../src/content";
import { StudioStore } from "../../src/studio/store";
import { EventEditor } from "../../src/studio/event-editor";
import { GraphList, layoutGraph } from "../../src/studio/graph";
import { addChoice, addScene, deleteScene, eventChecks, eventGraph, removeChoice, type EventRaw } from "../../src/studio/event";
import { deriveStory, filterStory } from "../../src/studio/story";
import { schemaFor } from "../../src/studio/schema";
import { temporaryPack } from "./pack";
const pack = temporaryPack(); afterAll(pack.cleanup);
function setup() { const store = new StudioStore(); store.disk = structuredClone(pack.files); return store; }
it("renders and round-trips every fixture event unchanged through its scene editor", () => {
  const store = setup(), before = structuredClone(store.files), documents = store.view.documents;
  for (const owner of documents.filter(d => d.kind === "events")) {
    const html = renderToStaticMarkup(formElement(EventEditor, { schema: schemaFor(owner.path)!, value: owner.raw, path: "", lockId: true, documents, owner, problems: [], onError: () => {}, onChange: () => { throw new Error("Rendering must not edit"); }, rename: () => {} }));
    expect(html).toContain('aria-label="Event editor"'); expect(html).toContain("Graph checks");
    store.edit(owner.path, owner.raw); expect(store.drafts.size).toBe(0);
  }
  expect(store.files).toEqual(before);
});
it("adds scenes and choices, removes the last choice into close, retargets before deleting, and renames with PR-07", () => {
  const store = setup(); let owner = store.view.documents.find(d => d.id === "shipwreck")!;
  const original = owner.raw;
  let raw = addScene(owner.raw as EventRaw, "new_scene", { text: "Another scene.", journal: "You enter." });
  raw = addChoice(raw, "start", { id: "new_choice", label: "continue", next: "new_scene", effects: [{ give: { matches: 2 } }] });
  store.edit(owner.path, raw); owner = store.view.documents.find(d => d.path === owner.path)!;
  expect(() => deleteScene(store.view.documents, owner, "new_scene")).toThrow("Retarget");
  expect(() => deleteScene(store.view.documents, owner, "start")).toThrow("reserved");
  expect(() => deleteScene(store.view.documents, owner, "new_scene", "absent")).toThrow("Retarget");
  expect(() => addChoice(raw, "start", { id: "bad_choice", label: "broken", next: "absent" })).toThrow();
  expect(() => addScene(raw, "start", { text: "No." })).toThrow();
  store.rename(owner.path, "scenes.new_scene", "renamed_scene");
  owner = store.view.documents.find(d => d.path === owner.path)!;
  expect((owner.raw as EventRaw).scenes.start.choices!.at(-1)!.next).toBe("renamed_scene");
  store.edit(owner.path, deleteScene(store.view.documents, owner, "renamed_scene", "start"));
  raw = store.view.documents.find(d => d.path === owner.path)!.raw as EventRaw;
  expect(raw.scenes.start.choices!.at(-1)).toMatchObject({ next: "start", effects: [{ give: { matches: 2 } }] });
  const index = raw.scenes.start.choices!.length - 1;
  raw = removeChoice(raw, "start", index);
  expect(formatContent(raw)).toBe(formatContent(original));
  store.edit(owner.path, raw); expect(store.view.diagnostics).toEqual([]);
});
it("detects registry errors and nonblocking unreachable warnings without inventing save rules", () => {
  const store = setup(), owner = store.view.documents.find(d => d.id === "shipwreck")!;
  const original = owner.raw as EventRaw;
  store.edit(owner.path, addScene(original, "unreachable_scene", { text: "Hidden." }));
  let current = store.view.documents.find(d => d.path === owner.path)!;
  expect(store.view.diagnostics).toEqual([]); expect(store.canSave).toBe(true);
  expect(eventChecks(current, [])).toContainEqual(expect.objectContaining({ path: "scenes.unreachable_scene", message: expect.stringContaining("Unreachable") }));
  const scenes = { ...(current.raw as EventRaw).scenes }; delete scenes.start;
  store.edit(owner.path, { ...original, scenes }); current = store.view.documents.find(d => d.path === owner.path)!;
  expect(eventChecks(current, store.view.diagnostics).some(p => p.path === "scenes.start")).toBe(true);
  expect(store.canSave).toBe(false);
  store.edit(owner.path, { ...original, scenes: { ...original.scenes, start: { ...original.scenes.start, choices: [{ id: "broken_choice", label: "go", next: "missing_scene" }] } } });
  current = store.view.documents.find(d => d.path === owner.path)!;
  expect(eventChecks(current, store.view.diagnostics).filter(p => p.path === "scenes.start.choices.0.next")).toHaveLength(1);
  const raw = removeChoice(current.raw as EventRaw, "start", 0);
  expect(raw.scenes.start.choices).toBeUndefined();
});
it("list views and laid-out graphs expose exactly the same nodes and edges; area/kind filtering is induced", () => {
  const store = setup(), documents = store.view.documents;
  for (const graph of [deriveStory(documents), ...documents.filter(d => d.kind === "events").map(eventGraph)]) {
    const layout = layoutGraph(graph), html = renderToStaticMarkup(createElement(GraphList, { graph, node: () => {}, edge: () => {} }));
    expect(layout.nodes.map(n => n.id)).toEqual(graph.nodes.map(n => n.id));
    expect(layout.edges.map(e => e.id)).toEqual(graph.edges.map(e => e.id));
    for (const node of graph.nodes) expect(html).toContain(`data-node="${node.id}"`);
    expect((html.match(/data-edge=/g) ?? []).length).toBe(graph.edges.length);
  }
  const filtered = filterStory(deriveStory(documents), "forest", ["discovery", "quest"]);
  expect(filtered.nodes.some(n => n.id === "discovery:rabbit_runs")).toBe(true);
  expect(filtered.nodes.every(n => n.areas?.includes("forest") && ["discovery", "quest"].includes(n.kind))).toBe(true);
  expect(filtered.edges.every(e => filtered.nodes.some(n => n.id === e.source) && filtered.nodes.some(n => n.id === e.target))).toBe(true);
});


it("cards only event properties, applies hints and keeps scene controls and comments unchanged", () => {
  const store = setup(), documents = store.view.documents, owner = documents.find(d => d.id === "shipwreck")!;
  const value = { ...owner.raw as object, _when: "Condition note", _title: "Title note", _note: "General note", _raw: { keep: true } };
  const html = renderToStaticMarkup(formElement(EventEditor, { schema: schemaFor(owner.path)!, value, path: "", documents, owner, problems: [], onError: () => {}, onChange: () => { throw new Error("Rendering must not edit"); }, rename: () => {} }));
  expect(html.match(/class="form-section"/g)).toHaveLength(1);
  for (const label of ["Event properties", ">Title</label>", ">Opens</label>", "+ Only when", "+ Repeat", 'aria-label="Selected scene or choice"', 'aria-label="Event scene graph"', 'aria-label="Event graph checks"', 'aria-label="scenes.start.text"']) expect(html).toContain(label);
  expect(html.indexOf('aria-label="_title"')).toBeLessThan(html.indexOf('data-field="title"'));
  expect(html.indexOf('aria-label="_note"')).toBeLessThan(html.indexOf('data-field="id"'));
  expect(html).toContain('<summary>_raw</summary>');
  const properties = html.split('<strong>Event properties</strong>')[1].split('<section class="graph-view"')[0];
  const [fields, optional] = properties.split('class="optional-fields"');
  expect(properties.match(/class="optional-fields"/g)).toHaveLength(1);
  expect(fields).not.toContain('class="optional-chip"');
  expect(optional).toContain('<span>Optional:</span>');
  for (const key of ["when", "repeat"]) expect(optional).toContain(`aria-label="Add ${key}"`);
  expect(optional.indexOf('aria-label="_when"')).toBeLessThan(optional.indexOf('aria-label="Add when"'));

});

function formElement<P extends FieldProps>(component: ComponentType<P>, props: P & FormContextValue) {
  const { documents, owner, problems, buffers, onError, requiredOnly, lockId, ...field } = props;
  return createElement(FormContext.Provider, { value: { documents, owner, problems, buffers, onError, requiredOnly, lockId } },
    createElement(component, field as unknown as P));
}

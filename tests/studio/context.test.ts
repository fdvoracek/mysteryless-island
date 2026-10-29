import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { readDocuments, type FileDocument } from "../../src/studio/documents";
import { documentContext, identities } from "../../src/studio/references";
import { ContextRail } from "../../src/studio/shell/ContextRail";
const root = fileURLToPath(new URL("../fixtures/", import.meta.url));
function files(directory = join(root, "content")): FileDocument[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : entry.name.endsWith(".json")
      ? [{ path: relative(root, path), content: readFileSync(path, "utf8"), hash: entry.name, encoding: "utf8" as const }] : [];
  });
}
const { documents } = readDocuments(files());
const fish = documents.find(d => d.kind === "activities" && d.id === "catch_fish")!;
it("classifies linked areas separately, retains incoming counters and groups outgoing target paths", () => {
  const context = documentContext(documents, fish);
  const beach = documents.find(d => d.kind === "regions" && d.id === "beach")!;
  const links = (beach.raw as { activities: string[] }).activities;
  expect(context.linkedFrom).toEqual([expect.objectContaining({
    file: beach.path, path: `activities.${links.indexOf(fish.id)}`,
    label: `${beach.label} · activity ${links.indexOf(fish.id) + 1} of ${links.length}`,
  })]);
  expect(context.referencedBy[0].references).toContainEqual(expect.objectContaining({ file: "content/activities/sleep.json" }));
  expect(context.referencedBy[0].references.some(ref => ref.file === beach.path)).toBe(false);
  for (const [id, kind] of [["school_of_fish", "discovery"], ["fishing_spear", "item"], ["raw_fish", "item"]]) {
    expect(context.uses).toContainEqual(expect.objectContaining({ id, kind, identity: expect.objectContaining({ id, kind }) }));
  }
  expect(context.uses.map(use => use.id)).toEqual(["school_of_fish", "fishing_spear", "raw_fish"]);
  expect(context.settingsUses.map(group => ({ kind: group.kind, ids: group.uses.map(use => use.id) })))
    .toEqual([{ kind: "phase", ids: ["dawn", "day", "dusk"] }]);
  expect(context.settingsUses[0].uses.every(use => use.identity?.file === "content/climate.json")).toBe(true);
  const rawFish = context.uses.filter(use => use.id === "raw_fish");
  expect(rawFish).toHaveLength(1);
  expect(rawFish[0].paths.length).toBeGreaterThan(1);
});
it("reports unresolved outgoing targets and renders them without a button", () => {
  const broken = { ...fish, raw: { ...fish.raw as object, requires: { item: "missing_context_item" } } };
  const pack = documents.map(d => d === fish ? broken : d);
  const context = documentContext(pack, broken);
  expect(context.uses.find(use => use.id === "missing_context_item")).toEqual({ kind: "item", id: "missing_context_item", paths: ["requires.item"] });
  const html = renderToStaticMarkup(createElement(ContextRail, { documents: pack, context, definitions: [], problems: [], busy: false,
    openProblem: () => {}, rename: () => {} }));
  expect(html).toContain('<div class="context-reference"><span>missing_context_item · item (unresolved)</span>');
});
it("preserves per-landmark groups, including empty groups, and same-file references", () => {
  const forest = documents.find(d => d.kind === "regions" && d.id === "forest")!;
  const context = documentContext(documents, forest);
  const landmarks = (forest.raw as { explore: { landmarks: { id: string }[] } }).explore.landmarks;
  expect(context.referencedBy.map(group => group.name)).toEqual(["Area forest", ...landmarks.map(l => `Landmark ${l.id}`)]);
  for (const group of context.referencedBy.slice(1)) {
    expect(group.references.every(ref => `Landmark ${ref.id}` === group.name)).toBe(true);
    if (group.name === "Landmark spring") expect(group.references.some(ref => ref.file === forest.path)).toBe(true);
  }
  const html = renderToStaticMarkup(createElement(ContextRail, { documents, context,
    definitions: identities(documents).filter(id => id.file === forest.path), problems: [], busy: false, openProblem: () => {}, rename: () => {} }));
  for (const group of context.referencedBy) {
    expect(html).toContain(`aria-label="Used by ${group.name}"`);
    if (!group.references.length) expect(html).toContain(`<h4>${group.name}</h4><p class="context-empty">Not referenced</p>`);
  }
  expect(html).not.toContain("Linked from");
});
it("renders ordered rail sections, clean status and accessible rename controls", () => {
  const html = renderToStaticMarkup(createElement(ContextRail, { documents, context: documentContext(documents, fish),
    definitions: identities(documents).filter(id => id.file === fish.path), problems: [], busy: false, openProblem: () => {}, rename: () => {} }));
  expect(html).toContain('<aside class="context-rail" aria-label="Document context">');
  expect([...html.matchAll(/<h3>(.*?)<\/h3>/g)].map(match => match[1])).toEqual(["Problems in this file", "Linked from", "Referenced by", "Uses", "IDs"]);
  expect(html).toContain("✓ No problems");
  expect(html).toContain('aria-label="Rename id"');
});
it("keeps empty area and landmark sections with explicit Not referenced lines", () => {
  const forest = documents.find(d => d.kind === "regions" && d.id === "forest")!;
  const raw = structuredClone(forest.raw) as { id: string; explore: { landmarks: { id: string }[] } };
  raw.id = "context_empty_area";
  raw.explore.landmarks.forEach((landmark, index) => { landmark.id = `context_empty_landmark_${index}`; });
  const owner = { ...forest, id: raw.id, raw };
  const pack = documents.map(d => d === forest ? owner : d);
  const context = documentContext(pack, owner);
  expect(context.referencedBy.every(group => group.references.length === 0)).toBe(true);
  const html = renderToStaticMarkup(createElement(ContextRail, { documents: pack, context, definitions: [], problems: [],
    busy: false, openProblem: () => {}, rename: () => {} }));
  for (const group of context.referencedBy) {
    expect(html).toContain(`aria-label="Used by ${group.name}"><h4>${group.name}</h4><p class="context-empty">Not referenced</p>`);
  }
});
it("resolves scenes and named production only in their owning files", () => {
  const event = documents.find(d => d.kind === "events")!;
  const otherEvent = { ...event, path: "content/events/context_other.json", id: "context_other" };
  const pack = [otherEvent, ...documents];
  const scenes = documentContext(pack, event).uses.filter(use => use.kind === "scene");
  expect(scenes.length).toBeGreaterThan(0);
  expect(scenes.every(use => use.identity?.file === event.path)).toBe(true);
  const rack = documents.find(d => d.kind === "buildings" && d.id === "drying_rack")!;
  const otherRack = { ...rack, path: "content/buildings/context_other_rack.json", id: "context_other_rack" };
  const owner = { ...fish, raw: { ...fish.raw as object, effects: [{ startCycle: "drying_rack", production: "meat" }] } };
  const production = documentContext([otherRack, ...documents.map(d => d === fish ? owner : d)], owner).uses.find(use => use.kind === "production");
  expect(production?.identity).toEqual(expect.objectContaining({ file: rack.path, path: "cycle.products.meat" }));
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, expect, it } from "vitest";
import { StudioStore } from "../../src/studio/store";
import { MapEditor } from "../../src/studio/map-editor";
import { mapAreas, moveArea, overlaps, regionOrder } from "../../src/studio/map";
import { temporaryPack } from "./pack";
const pack = temporaryPack(); afterAll(pack.cleanup);
function setup() { const store = new StudioStore(); store.disk = structuredClone(pack.files); return store; }
const disk = (id: string) => JSON.parse(pack.files.find(f => f.path === `content/regions/${id}.json`)!.content);

it("shows every fixture area at its cell with camp and travel hours, and round-trips unchanged", () => {
  const store = setup(), before = structuredClone(store.files), documents = store.view.documents;
  const areas = mapAreas(documents);
  expect(areas.map(a => [a.id, a.placed, a.isDefault, a.camp])).toEqual([
    ["beach", { x: 0, y: 0 }, false, true], ["forest", { x: 1, y: 0 }, false, false], ["meadows", { x: -1, y: 0 }, false, false],
  ].sort((a, b) => regionOrder(documents).indexOf(a[0] as string) - regionOrder(documents).indexOf(b[0] as string)));
  const html = renderToStaticMarkup(createElement(MapEditor, { documents, problems: [], edit: () => { throw new Error("Rendering must not edit"); }, open: () => {} }));
  for (const a of areas) expect(html).toContain(`aria-label="Area ${a.id}"`);
  expect(html).toContain("0.5 h"); expect(html).toContain("beach → forest: 0.5 h"); expect(html).toContain('step="0.25"');
  for (const d of documents.filter(d => d.kind === "regions")) store.edit(d.path, d.raw);
  expect(store.drafts.size).toBe(0); expect(store.files).toEqual(before);
});
it("moves an area by changing only region.map and saves without diagnostics", () => {
  const store = setup(), moved = moveArea(store.view.documents, "forest", { x: 3, y: 2 });
  store.edit(moved.path, moved.raw);
  const expected = disk("forest"); expected.map = { x: 3, y: 2 };
  expect(JSON.parse(store.drafts.get("content/regions/forest.json")!)).toEqual(expected);
  expect([...store.drafts.keys()]).toEqual(["content/regions/forest.json"]); expect(store.view.diagnostics).toEqual([]);
});
it("refuses an occupied cell before staging and a malformed cell", () => {
  const store = setup();
  expect(() => moveArea(store.view.documents, "forest", { x: -1, y: 0 })).toThrow("occupied by meadows");
  expect(() => moveArea(store.view.documents, "forest", { x: 0.5, y: 0 })).toThrow("whole numbers");
  expect(() => moveArea(store.view.documents, "absent", { x: 5, y: 5 })).toThrow("cannot be moved");
  expect(store.drafts.size).toBe(0);
});
it("places an area without map at its order index on row 0, writes map explicitly when moved and warns on overlap", () => {
  const store = setup(), forest = store.view.documents.find(d => d.id === "forest")!;
  const { map, ...rest } = forest.raw as Record<string, unknown>; void map;
  store.edit(forest.path, rest);
  let documents = store.view.documents;
  const order = regionOrder(documents), area = mapAreas(documents).find(a => a.id === "forest")!;
  expect(area).toMatchObject({ isDefault: true, map: undefined, placed: { x: order.indexOf("forest"), y: 0 } });
  expect(overlaps(mapAreas(documents).map(a => ({ id: a.id, at: a.placed })))).toEqual([]);
  const moved = moveArea(documents, "forest", { x: 4, y: 4 });
  store.edit(moved.path, moved.raw); documents = store.view.documents;
  expect(mapAreas(documents).find(a => a.id === "forest")).toMatchObject({ isDefault: false, map: { x: 4, y: 4 } });
  expect(Object.keys(JSON.parse(store.drafts.get(forest.path)!))).toContain("map");
  const coincide = structuredClone(rest) as Record<string, unknown>;
  const second = documents.find(d => d.id === "meadows")!;
  store.edit(second.path, { ...(second.raw as object), map: { x: order.indexOf("forest"), y: 0 } });
  store.edit(forest.path, coincide);
  const html = renderToStaticMarkup(createElement(MapEditor, { documents: store.view.documents, problems: [], edit: () => {}, open: () => {} }));
  expect(html).toContain("Occupied cell:");
});

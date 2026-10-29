import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { EntityList } from "../../src/studio/shell/EntityList";
import { kindSingulars, readDocuments } from "../../src/studio/documents";

const { documents } = readDocuments(["light_fire", "strike_fire", "make_fire"].map(id => ({
  path: `content/activities/${id}.json`, encoding: "utf8" as const, hash: id,
  content: readFileSync(new URL(`../fixtures/content/activities/${id}.json`, import.meta.url), "utf8"),
})), false);
const render = (scope: string) => renderToStaticMarkup(createElement(EntityList, {
  documents, visible: documents, scope, drafts: new Map([[documents[0].path, {}]]),
  diagnostics: [{ file: documents[0].path, path: "", message: "problem" }], empty: "No files match this search.",
  selectedPath: documents[0].path, select: () => {}, create: () => {},
}));
it("distinguishes the three light fire methods with conditions, global badges and hours", () => {
  const html = render("activities");
  const metas = [...html.matchAll(/class="entity-row-meta"[^>]*>(.*?)<\/span><\/button>|class="entity-row-meta"[^>]*>(.*?)<\/span><span class="dirty"/g)];
  expect(metas).toHaveLength(3);
  expect(new Set(metas.map(match => match[1] ?? match[2])).size).toBe(3);
  expect(html).toContain('0.25 h'); expect(html).toContain('1 h');
  expect(html).toContain('global-badge'); expect(html).toContain('matches');
  expect(html).toContain('aria-pressed="true"'); expect(html).toContain('<code>strike_fire</code>');
  expect(html).toContain('Unsaved'); expect(html).toContain('· has problems');
});
it("uses explicit singular labels and omits contextual creation for All files and Settings", () => {
  expect(kindSingulars).toMatchObject({ regions: "area", activities: "activity", items: "item", quests: "task", artwork: "artwork" });
  expect(render("items")).toContain('+ New item');
  expect(render("all")).not.toContain('list-foot');
  expect(render("settings")).not.toContain('list-foot');
});

it("offers contextual creation only for kinds supported by the existing Create dialog", () => {
  expect(render("items")).toContain('+ New item');
  expect(render("illustrations")).not.toContain('list-foot');
  expect(render("trees")).not.toContain('list-foot');
});

it("renders item category and tool tags, empty item metadata and kind labels", () => {
  const { documents: items } = readDocuments([
    ["items/tool", { id: "tool", name: "tool", category: "tool", tool: { tags: ["sharp", "fire_starter"] } }],
    ["items/wood", { id: "wood", name: "wood", category: "material" }],
    ["sites/river", { id: "river", name: "river" }],
  ].map(([path, raw]) => ({ path: `content/${path}.json`, content: JSON.stringify(raw), encoding: "utf8" as const, hash: "" })), false);
  const html = renderToStaticMarkup(createElement(EntityList, {
    documents: items, visible: items, scope: "items", drafts: new Map(), diagnostics: [], empty: "empty", select: () => {}, create: () => {},
  }));
  expect(html).toContain('entity-row-key">material</span>');
  expect(html).toContain('tool · sharp · fire_starter');
  expect(html).toContain('entity-row-meta" title=""></span>');
  expect(html).toContain('entity-row-meta" title="Sites">Sites</span>');
});

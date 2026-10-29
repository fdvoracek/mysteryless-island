import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { EntityList, distinguishingMeta } from "../../src/studio/shell/EntityList";
import { areaDocuments, kindSingulars, readDocuments } from "../../src/studio/documents";
import { readContentFiles } from "../helpers";

const fixtureDocuments = readDocuments(Object.entries(readContentFiles()).map(([path, raw]) => ({
  path, content: JSON.stringify(raw), encoding: "utf8" as const, hash: "fixture",
}))).documents;
const beach = fixtureDocuments.find(document => document.id === "beach")!;

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

it("removes only parts shared by all same-named visible beach activities", () => {
  const rows = areaDocuments(fixtureDocuments, beach);
  const meta = distinguishingMeta(rows, fixtureDocuments);
  const fire = rows.filter(row => row.label === "light fire");
  const texts = fire.map(row => meta.get(row.path)!);
  expect(new Set(texts).size).toBe(3);
  for (const text of texts) {
    expect(text).not.toContain("campfire");
    expect(text).not.toContain("fire hours");
  }
  expect(texts[0]).toMatch(/^carrying matches/);
  expect(texts[1]).toMatch(/^not \(carrying matches.* · carrying stone/);
  expect(texts[2]).toMatch(/^not \(carrying matches.* · not \(carrying stone/);
  const unique = distinguishingMeta([fire[0]], fixtureDocuments).get(fire[0].path)!;
  expect(unique).toContain("campfire built here");
  expect(unique).not.toMatch(/^\(/);
  const fallback = distinguishingMeta([fire[0], { ...fire[0], path: "copy" }], fixtureDocuments);
  expect(fallback.get("copy")).toBe(`(${unique})`);
});

it("unwraps a unique top-level any group and falls back to requirements or always", () => {
  const rows = [
    { ...documents[0], label: "unique", raw: { requires: { any: [{ item: "matches" }, { item: "stone" }] } } },
    { ...documents[1], label: "unconditional", raw: {} },
  ];
  const meta = distinguishingMeta(rows, fixtureDocuments);
  expect(meta.get(rows[0].path)).toMatch(/^carrying matches.* or carrying stone.*1$/);
  expect(meta.get(rows[1].path)).toBe("always");
});

it("orders the fixture beach area before its linked activities in authored player order", () => {
  expect(areaDocuments([...fixtureDocuments].reverse(), beach).map(document => document.id)).toEqual([
    "beach", "light_fire", "strike_fire", "make_fire", "stoke_fire", "collect_shells", "collect_stones", "catch_fish", "sleep",
  ]);
});

it("appends unlinked globals by name without repeating linked globals", () => {
  const area = { ...beach, raw: { ...beach.raw as object, activities: ["sleep", "collect_shells"] } };
  expect(areaDocuments([...fixtureDocuments].reverse(), area).map(document => document.id)).toEqual([
    "beach", "sleep", "collect_shells", "light_fire", "make_fire", "strike_fire", "stoke_fire",
  ]);
});

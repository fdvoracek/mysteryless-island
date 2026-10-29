import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Sidebar } from "../../src/studio/shell/Sidebar";
import { readDocuments, kindLabels } from "../../src/studio/documents";

it("renders the four navigation groups, ordered kinds, counts and named area travel metadata", () => {
  const { documents } = readDocuments([
    ["regions/beach", { id: "beach", name: "the beach", travelHours: 0 }],
    ["regions/forest", { id: "forest", name: "the forest", travelHours: .5 }],
    ["items/knife", { id: "knife", name: "knife" }], ["game", {}],
  ].map(([path, value]) => ({ path: `content/${path}.json`, content: JSON.stringify(value), encoding: "utf8" as const, hash: "" })), false);
  const html = renderToStaticMarkup(createElement(Sidebar, {
    documents, scope: "area:forest", browse: () => {}, openArea: () => {}, newArea: () => {},
  }));
  expect(html).toContain('aria-label="Content navigation"');
  expect([...html.matchAll(/<h2>(.*?)<\/h2>/g)].map(match => match[1])).toEqual(["World", "Areas", "Library", "Settings"]);
  expect(html).toMatch(/>Map<.*>Story<.*>Trees</);
  expect(html).toContain('aria-label="the beach">the beach<span>camp</span>');
  expect(html).toContain('aria-label="the forest" aria-current="page">the forest<span>0.5 h</span>');
  expect(html).toContain('All files<span>4</span>');
  expect(html).toContain('Items<span>1</span>');
  expect(html).not.toContain('Illustrations');
  expect(html).toContain('Game settings<span>1</span>');
  expect(html.indexOf('Areas<span>2')).toBeLessThan(html.indexOf('Items<span>1'));
  expect(html).not.toContain('aria-expanded');
  expect(html).toContain('+ New area');
  expect(Object.keys(kindLabels).indexOf("regions")).toBeLessThan(Object.keys(kindLabels).indexOf("items"));
});

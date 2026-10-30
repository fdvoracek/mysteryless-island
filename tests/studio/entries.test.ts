import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ItemAction, Landmark, RecipeWay } from "../../src/content";
import { collapsibleEntries, staleEntries } from "../../src/studio/hints";
import { boundedExpansion, moveExpansion, removeExpansion, useExpansion, type ExpansionOptions } from "../../src/studio/entries";

it("binds only the three exported element schemas and rejects stale titles and summary keys", () => {
  expect([...collapsibleEntries.keys()]).toEqual([Landmark, ItemAction, RecipeWay]);
  expect(collapsibleEntries.get(RecipeWay)?.title).toBeUndefined();
  expect(staleEntries()).toEqual([]);
  expect(staleEntries(new Map([[ItemAction, { title: "missing", summary: ["hours", "gone"] }]])))
    .toEqual(["ItemAction.missing", "ItemAction.gone"]);
  expect(staleEntries(new Map([[RecipeWay, { summary: ["hours"] }]]))).toEqual([]);
});

function expansion(length: number, paths: string[], options: ExpansionOptions) {
  let expanded: number[] = [];
  function Probe() {
    expanded = useExpansion("actions", length, paths.map(path => ({ path, file: "", message: "broken" })), options).expanded;
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return expanded;
}
it("initializes a single entry open, multiple entries closed, and adds diagnostic entries", () => {
  expect(expansion(1, [], { initial: [0] })).toEqual([0]);
  expect(expansion(2, [], { initial: [] })).toEqual([]);
  expect(expansion(3, ["actions.1.hours", "actions.1.label", "actions.2", "other.0", "actions.9.hours"], { initial: [0] }))
    .toEqual([0, 1, 2]);
});
it("preserves outcome exclusions and bounds initial indices", () => {
  expect(expansion(2, ["actions.0.weight", "actions.1.text"], {
    initial: [-1, 8], ignore: (path, i) => path === `actions.${i}.weight`,
  })).toEqual([1]);
});
it("keeps expansion on the moved entry and remaps removals before bounding", () => {
  expect(moveExpansion([0, 2], 0, 1)).toEqual([1, 2]);
  expect(moveExpansion([1], 0, 1)).toEqual([0]);
  expect(removeExpansion([0, 2, 3], 1)).toEqual([0, 1, 2]);
  expect(removeExpansion([0, 2], 2)).toEqual([0]);
  expect(boundedExpansion([-1, 0, 2, 5], 2)).toEqual([0]);
  expect(boundedExpansion([0, 2], 0)).toEqual([]);
});

import { expect, it } from "vitest";
import { Activity, Artwork, Item, ItemAction, Site, Region, Landmark, Recipe, RecipeWay, Building, BuildingStep, Quest, GameEvent } from "../../src/content";
import { hintFor, hints, humanize, staleHints, sections, sectionsFor } from "../../src/studio/hints";

it("binds the shipped hints to exported schema objects and rejects stale shape keys", () => {
  expect([...hints.keys()]).toEqual([Activity, ItemAction, Item, Site, Artwork, Region, Landmark, Recipe, RecipeWay, Building, BuildingStep, Quest, GameEvent]);
  expect(staleHints()).toEqual([]);
  expect(staleHints(new Map([[Region, { missing: {} }]]))).toEqual(["Region.missing"]);
  expect(hintFor(Building.shape.build, "log")).toBeUndefined();
  expect(hintFor(GameEvent.omit({ scenes: true }), "trigger")).toBeUndefined();
  expect(staleHints(new Map([[Activity, { notAField: {} }]]))).toEqual(["Activity.notAField"]);
});

it("looks up wrapped schemas by identity without applying hints to shape copies", () => {
  expect(hintFor(Activity.optional(), "visibleWhen")).toEqual({ label: "Visible when", help: "Button appears" });
  expect(hintFor(Activity.omit({ global: true }), "visibleWhen")).toBeUndefined();
  expect(hintFor(Item, "visibleWhen")).toBeUndefined();
  expect(hintFor(Activity, "outcomes")).toBeUndefined();
});

it("humanizes fallback labels", () => {
  for (const [key, label] of [["visibleWhen", "Visible when"], ["id", "ID"], ["hoursFactor", "Hours factor"], ["name", "Name"], ["baseC", "Base C"], ["warmthC", "Warmth C"], ["C", "C"]]) expect(humanize(key)).toBe(label);
});

it("binds sections by schema identity and detects unknown, duplicate and split-row keys", () => {
  expect([...sections.keys()]).toEqual([Activity, Item, Recipe, Building, Quest]);
  expect(sectionsFor(Activity.optional())).toBe(sections.get(Activity));
  expect(sectionsFor(Activity.omit({ global: true }))).toBeUndefined();
  expect(staleHints(hints, new Map([[Activity, [{ title: "Bad", keys: ["notAField"] }]]]))).toEqual(["sections:Activity.notAField"]);
  expect(staleHints(hints, new Map([[Activity, [{ title: "One", keys: ["name"] }, { title: "Two", keys: ["name"] }]]]))).toEqual(["sections:Activity.name"]);
  expect(staleHints(hints, new Map([[Activity, [{ title: "One", keys: ["hours"] }, { title: "Two", keys: ["effort"] }]]]))).toEqual(["sections:Activity.effort"]);
});

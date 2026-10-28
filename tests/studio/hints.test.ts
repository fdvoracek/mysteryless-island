import { expect, it } from "vitest";
import { Activity, Artwork, Item, ItemAction, Site } from "../../src/content";
import { hintFor, hints, humanize, staleHints } from "../../src/studio/hints";

it("binds the shipped hints to exported schema objects and rejects stale shape keys", () => {
  expect([...hints.keys()]).toEqual([Activity, ItemAction, Item, Site, Artwork]);
  expect(staleHints()).toEqual([]);
  expect(staleHints(new Map([[Activity, { notAField: {} }]]))).toEqual(["Activity.notAField"]);
});

it("looks up wrapped schemas by identity without applying hints to shape copies", () => {
  expect(hintFor(Activity.optional(), "visibleWhen")).toEqual({ label: "Visible when", help: "Button appears" });
  expect(hintFor(Activity.omit({ global: true }), "visibleWhen")).toBeUndefined();
  expect(hintFor(Item, "visibleWhen")).toBeUndefined();
  expect(hintFor(Activity, "outcomes")).toBeUndefined();
});

it("humanizes fallback labels", () => {
  for (const [key, label] of [["visibleWhen", "Visible when"], ["id", "ID"], ["hoursFactor", "Hours factor"], ["name", "Name"]]) expect(humanize(key)).toBe(label);
});

import { expect, it } from "vitest";
import { suggestId, takenIds } from "../../src/studio/id-suggest";
import { StudioStore } from "../../src/studio/store";
it.each([
  ["Šípek", [], "sipek"], [" Fishing -- net! ", [], "fishing_net"], ["net 42", [], "net_42"],
  ["42 nets", [], "42_nets"], ["raw fish", ["raw_fish", "raw_fish_2"], "raw_fish_3"],
  ["", [], ""], [" — ! ", [], ""], ["net", ["net_2"], "net"],
])("suggests %s", (text, taken, expected) => expect(suggestId(text, new Set(taken))).toBe(expected));
it("skips identities that exist only in unsaved drafts, including nested IDs", () => {
  const store = new StudioStore();
  store.create("items", { id: "net", name: "net", category: "material" });
  store.edit("content/items/other.json", { id: "other", name: "other", category: "material", actions: [{ id: "net_2", label: "use" }] });
  expect(store.disk).toEqual([]);
  const taken = takenIds(store.view.documents);
  expect(taken.has("net")).toBe(true);
  expect(taken.has("net_2")).toBe(true);
  expect(suggestId("net", taken)).toBe("net_3");
  expect(store.createProblems("items", { id: "net_3", name: "net", category: "material" })).toEqual([]);
});

import { describe, expect, it } from "vitest";
import { buildRegistry, ContentError } from "../../src/content";
import { readContentFiles } from "../helpers";
import legacy from "./diagnostic-legacy.json";
import { diagnosticScenarios, brokenDiagnosticPack } from "./diagnostic-scenarios";
import { areaDocuments, readDocuments } from "../../src/studio/documents";

function error(files: Record<string, unknown>) {
  try { buildRegistry(files); } catch (error) {
    expect(error).toBeInstanceOf(ContentError);
    return error as ContentError;
  }
  throw new Error("Expected invalid content");
}
describe("structured content diagnostics without changed messages", () => {
  it("locates a schema field and a reference while preserving the full legacy message", () => {
    const files = readContentFiles();
    (files["content/activities/gather_wood.json"] as { hours: unknown }).hours = "bad";
    (files["content/items/knife.json"] as { artwork?: string }).artwork = "missing_art";
    const result = error(files);
    expect(result.message).toBe(`content has ${result.problems.length} problem(s):\n${result.problems.join("\n")}`);
    expect(result.diagnostics).toContainEqual({ file: "content/activities/gather_wood.json", path: "hours", message: "content/activities/gather_wood.json: hours: Expected number, received string" });
    expect(result.diagnostics).toContainEqual({ file: "content/items/knife.json", path: "artwork", message: 'content/items/knife.json.knife.artwork: unknown artwork "missing_art"' });
  });
  it("locates standalone activities, embedded landmarks, item actions and singleton fields", () => {
    const files = readContentFiles();
    (files["content/activities/gather_wood.json"] as { requires?: unknown }).requires = { item: "missing_item" };
    const beach = files["content/regions/beach.json"] as { explore: { landmarks: { requires?: unknown }[] } };
    beach.explore.landmarks[0].requires = { item: "missing_item" };
    const item = files["content/items/raw_fish.json"] as { actions: { requires?: unknown }[] };
    item.actions[0].requires = { item: "missing_item" };
    (files["content/game.json"] as { start: { region: string } }).start.region = "missing_area";
    const result = error(files);
    for (const [file, path] of [
      ["content/activities/gather_wood.json", "requires.item"],
      ["content/regions/beach.json", "explore.landmarks.0.requires.item"],
      ["content/items/raw_fish.json", "actions.0.requires.item"],
      ["content/game.json", "start.region"],
    ]) expect(result.diagnostics).toContainEqual({ file, path, message: expect.any(String) });
  });
  it("reports malformed nested schema values without diagnostic code throwing", () => {
    for (const value of [null, "wrong", { landmarks: "wrong" }, { landmarks: [null] }]) {
      const files = readContentFiles();
      (files["content/regions/beach.json"] as { explore: unknown }).explore = value;
      const result = error(files);
      expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ file: "content/regions/beach.json", path: expect.any(String) })]));
    }
  });
  it("links duplicate explicit text identity to its source", () => {
    const files = readContentFiles();
    for (const id of ["collect_stones", "gather_wood"]) (files[`content/activities/${id}.json`] as { log: unknown }).log = { id: "duplicate_passage", variants: ["A.", "B."] };
    expect(error(files).diagnostics[0]).toMatchObject({ file: expect.stringMatching(/content\/activities\/.+\.json/), path: "log.id" });
  });
});

it("keeps raw comments, browses area activity links, and reports malformed JSON", () => {
  const files = readContentFiles();
  const documents = Object.entries(files).map(([path, value]) => ({ path, content: JSON.stringify(value), encoding: "utf8" as const, hash: "test-hash" }));
  const result = readDocuments(documents);
  expect(result.diagnostics).toEqual([]);
  const forest = result.documents.find((document) => document.id === "forest")!;
  const area = areaDocuments(result.documents, forest);
  expect(area.map((document) => document.id)).toContain("gather_wood");
  expect(area.map((document) => document.id)).toContain("sleep");
  expect(area.map((document) => document.id)).not.toContain("collect_stones");
  expect(forest.formatted).toContain('"_map"');
  documents.find((document) => document.path === "content/items/knife.json")!.content = "{broken";
  const broken = readDocuments(documents);
  expect(broken.diagnostics).toContainEqual({ file: "content/items/knife.json", path: "", message: expect.stringContaining("Invalid JSON") });
  expect(broken.documents.find((document) => document.path === "content/items/knife.json")!.formatted).toBe("{broken");
});

const expectedPositions: Record<string, [string, string, number]> = {
  schema: ["content/activities/gather_wood.json", "hours", 0],
  condition: ["content/activities/gather_wood.json", "requires.all.0.not.item", 0],
  yield: ["content/activities/gather_wood.json", "yields.0.item", 0],
  effect: ["content/activities/gather_wood.json", "effects.0.give.missing_item", 0],
  duplicate: ["content/items/knife.json", "id", 1],
  text: ["content/activities/gather_wood.json", "log.id", 0],
  filename: ["content/items/wrong_name.json", "id", 0],
  activity: ["content/regions/beach.json", "activities.8", 0],
  cycle: ["content/trees/crafting.json", "nodes.0.after.0", 0],
  missing: ["content/game.json", "", 0],
};

it.each(Object.entries(diagnosticScenarios))("records %s at its source and keeps main's exact problem strings", (name, edit) => {
  const files = readContentFiles(); edit(files);
  const result = error(files);
  const messages = legacy[name as keyof typeof legacy];
  expect(result.problems).toEqual(messages);
  expect(result.message).toBe(`content has ${messages.length} problem(s):\n${messages.join("\n")}`);
  const [file, path, index] = expectedPositions[name];
  expect(result.diagnostics[index]).toEqual({ file, path, message: messages[index] });
});

it("preserves the exact ordered broken-pack strings recorded from main d609c1e", () => {
  const result = error(brokenDiagnosticPack());
  expect(result.problems).toEqual(legacy.brokenPack);
  expect(result.message).toBe(`content has ${legacy.brokenPack.length} problem(s):\n${legacy.brokenPack.join("\n")}`);
});

it("rejects a duplicate activity link at the repeated raw array position", () => {
  const files = readContentFiles();
  (files["content/regions/beach.json"] as { activities: string[] }).activities.push("light_fire");
  expect(error(files).diagnostics).toEqual([{
    file: "content/regions/beach.json", path: "activities.8",
    message: 'content/regions/beach.json: activities.8: duplicate activity link "light_fire"',
  }]);
});

it("uses code-unit ordering for file enumeration, entity ties and region ties", () => {
  const files = readContentFiles();
  const ids = ["sort_a", "sorta", "sort0"];
  for (const id of ids) {
    files[`content/items/${id}.json`] = { id, name: id, category: "material" };
    const areaId = `area_${id}`;
    files[`content/regions/${areaId}.json`] = { id: areaId, name: areaId, title: areaId, description: "Test.", climate: { baseC: 18 }, travelHours: 0.5, order: 1000, activities: [] };
  }
  const reg = buildRegistry(Object.fromEntries(Object.entries(files).reverse()));
  expect([...reg.items.keys()].filter((id) => ids.includes(id))).toEqual(["sort0", "sort_a", "sorta"]);
  expect([...reg.regions.keys()].filter((id) => id.startsWith("area_sort"))).toEqual(["area_sort0", "area_sort_a", "area_sorta"]);
  expect(reg.regionOrder.filter((id) => id.startsWith("area_sort"))).toEqual(["area_sort0", "area_sort_a", "area_sorta"]);
});

it("keeps distinct raw positions for repeated invalid values and tag/ID collisions", () => {
  const files = readContentFiles();
  (files["content/events/shipwreck.json"] as { trigger: unknown }).trigger = { after: ["missing_after", "missing_after"], chance: 0.5 };
  (files["content/items/knife.json"] as { tool: unknown }).tool = { tags: ["missing_tool", "missing_tool"] };
  (files["content/activities/gather_wood.json"] as { tags: string[] }).tags = ["knife"];
  const result = error(files);
  for (const index of [0, 1]) {
    expect(result.diagnostics).toContainEqual({ file: "content/events/shipwreck.json", path: `trigger.after.${index}`, message: expect.stringContaining('unknown action "missing_after"') });
    expect(result.diagnostics).toContainEqual({ file: "content/items/knife.json", path: `tool.tags.${index}`, message: expect.stringContaining('unknown tool tag "missing_tool"') });
  }
  expect(result.diagnostics).toContainEqual({ file: "content/activities/gather_wood.json", path: "tags.0", message: 'tag "knife" has the same name as an id (content/items/knife.json); { "did": "knife" } would be ambiguous' });
});

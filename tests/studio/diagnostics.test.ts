import { describe, expect, it } from "vitest";
import { buildRegistry, ContentError } from "../../src/content";
import { readContentFiles } from "../helpers";
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
      ["content/activities/gather_wood.json", "requires"],
      ["content/regions/beach.json", "explore.landmarks.0.requires"],
      ["content/items/raw_fish.json", "actions.0.requires"],
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
    expect(error(files).diagnostics[0]).toMatchObject({ file: expect.stringMatching(/content\/activities\/.+\.json/), path: "log" });
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

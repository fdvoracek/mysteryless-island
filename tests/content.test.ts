import { describe, expect, it } from "vitest";
import { buildRegistry, ContentError } from "../src/content/registry";
import { loadRegistry, readContentFiles } from "./helpers";

describe("content", () => {
  it("validates against the schemas and all references resolve", () => {
    expect(() => loadRegistry()).not.toThrow();
  });

  it("contains the prototype regions", () => {
    const reg = loadRegistry();
    expect(reg.regionOrder).toEqual(["beach", "forest"]);
  });

  it("reports unknown references with the file and path", () => {
    const files = readContentFiles();
    const beach = structuredClone(files["content/regions/beach.json"]) as { activities: Array<{ cost?: Record<string, number> }> };
    beach.activities[0].cost = { unobtainium: 1 };
    files["content/regions/beach.json"] = beach;
    try {
      buildRegistry(files);
      throw new Error("expected a ContentError");
    } catch (e) {
      expect(e).toBeInstanceOf(ContentError);
      expect((e as ContentError).problems.join("\n")).toContain('unknown item "unobtainium"');
    }
  });

  it("rejects typos in keys instead of ignoring them", () => {
    const files = readContentFiles();
    const forest = structuredClone(files["content/regions/forest.json"]) as Record<string, unknown>;
    forest.travleHours = 2;
    files["content/regions/forest.json"] = forest;
    expect(() => buildRegistry(files)).toThrow(ContentError);
  });

  it("rejects stat words that don't sit on star boundaries", () => {
    const files = readContentFiles();
    const stats = structuredClone(files["content/stats.json"]) as { stats: Array<{ words: Array<{ upTo: number }> }> };
    stats.stats[0].words[3].upTo = 85;
    files["content/stats.json"] = stats;
    expect(() => buildRegistry(files)).toThrow(/not on a star boundary/);
  });

  it("ignores _note comment keys", () => {
    const files = readContentFiles();
    const forest = structuredClone(files["content/regions/forest.json"]) as Record<string, unknown>;
    forest._note = "a comment";
    files["content/regions/forest.json"] = forest;
    expect(() => buildRegistry(files)).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { buildRegistry, ContentError } from "../src/content/registry";
import { loadRegistry, readContentFiles } from "./helpers";

describe("registry validation with frozen test content", () => {
  it("accepts the test scenario", () => {
    expect(() => loadRegistry()).not.toThrow();
  });

  it("rejects action times that are not whole clock steps (15 minutes)", () => {
    const files = readContentFiles();
    const beach = structuredClone(files["content/regions/beach.json"]) as { activities: Array<{ id: string; hours: number }> };
    beach.activities.find((x) => x.id === "collect_shells")!.hours = 0.1;
    files["content/regions/beach.json"] = beach;
    try { buildRegistry(files); throw new Error("expected a ContentError"); } catch (err) {
      expect(err).toBeInstanceOf(ContentError);
      expect((err as ContentError).problems.join("\n")).toMatch(/activity collect_shells\.hours: 0\.1 h is not a whole number of 15-minute steps/);
    }
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

  it("ignores _note comment keys", () => {
    const files = readContentFiles();
    const forest = structuredClone(files["content/regions/forest.json"]) as Record<string, unknown>;
    forest._note = "a comment";
    files["content/regions/forest.json"] = forest;
    expect(() => buildRegistry(files)).not.toThrow();
  });
});

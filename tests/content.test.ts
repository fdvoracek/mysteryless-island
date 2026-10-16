import { describe, expect, it } from "vitest";
import { buildRegistry, ContentError } from "../src/content/registry";
import { sentence } from "../src/core/text";
import { loadRegistry, readContentFiles } from "./helpers";

describe("content", () => {
  it("validates against the schemas and all references resolve", () => {
    expect(() => loadRegistry()).not.toThrow();
  });

  it("writes every sentence with a capital letter (story, hints, reasons)", () => {
    // fields that hold sentences; labels (names, button labels, verbs, task titles) stay lowercase
    const SENTENCES = new Set(["log", "text", "description", "hint", "requiresText", "deathLog",
      "doneLog", "startLog", "nothingLog", "warnLog", "expireLog", "intro", "otherwise"]);
    const bad: string[] = [];
    const walk = (o: unknown, path: string, key?: string) => {
      if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${path}[${i}]`, key));
      else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (!k.startsWith("_")) walk(v, `${path}.${k}`, k); }
      else if (typeof o === "string" && key && SENTENCES.has(key) && sentence(o) !== o) bad.push(`${path}: "${o}"`);
    };
    for (const [file, data] of Object.entries(readContentFiles())) walk(data, file);
    expect(bad).toEqual([]);
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

  it("ignores _note comment keys", () => {
    const files = readContentFiles();
    const forest = structuredClone(files["content/regions/forest.json"]) as Record<string, unknown>;
    forest._note = "a comment";
    files["content/regions/forest.json"] = forest;
    expect(() => buildRegistry(files)).not.toThrow();
  });
});

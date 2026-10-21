import { describe, expect, it } from "vitest";
import { readContentFiles } from "./helpers";

type Text = string | string[];
const alternatives = (text: Text): string[] => typeof text === "string" ? [text] : text;
const files = readContentFiles();

const journalKeys = new Set([
  "log", "journal", "description", "text", "startLog", "doneLog", "warnLog", "expireLog",
  "readyLog", "intro", "otherwise", "deathLog", "newDay", "midnight", "exhausted", "hunger",
  "thirst", "both", "crafted", "walkTo", "wayOpens", "nothingNew",
]);

function modalOnly(file: string, path: string): boolean {
  if (file.startsWith("content/events/") && /\.text(?:\[\d+\])?$/.test(path)) return true;
  if (file.startsWith("content/regions/") && /(?:^|\.)explore\.(view|landmarks|nothingLeft)/.test(path)
    && !/\.journal(?:\[\d+\])?$/.test(path)) return true;
  if (file === "content/game.json" && /^(newPlace|ending|tasks|provisions\.preparation)\./.test(path)) return true;
  return false;
}

describe("two-channel narrative writing", () => {
  it("keeps journal entries under the narrow-column budget", () => {
    const overlong: string[] = [];
    const walk = (value: unknown, file: string, path = "", key = ""): void => {
      if (typeof value === "string") {
        if (journalKeys.has(key) && !modalOnly(file, path) && value.length > 80)
          overlong.push(`${file}:${path} (${value.length} chars)`);
      } else if (Array.isArray(value)) {
        value.forEach((item, i) => walk(item, file, `${path}[${i}]`, key));
      } else if (value && typeof value === "object") {
        for (const [child, item] of Object.entries(value))
          if (!child.startsWith("_")) walk(item, file, path ? `${path}.${child}` : child, child);
      }
    };
    for (const [path, value] of Object.entries(files)) walk(value, path);
    expect(overlong).toEqual([]);
  });

  it("provides compact journal summaries for every shipped modal scene and discovery", () => {
    const story = files["content/events/story.json"] as Array<{
      scenes: Record<string, { text: Text; journal?: Text }>;
    }>;
    const regions = [
      "content/regions/beach.json",
      "content/regions/forest.json",
      "content/regions/meadows.json",
    ];

    for (const event of story) for (const scene of Object.values(event.scenes)) {
      expect(scene.journal).toBeDefined();
      expect(alternatives(scene.journal!).every((line) => line.length <= 80)).toBe(true);
      expect(alternatives(scene.text).some((line) => line.length > 80)).toBe(true);
    }
    for (const path of regions) {
      const region = files[path] as { explore: { landmarks: Array<{ text: Text; journal?: Text }> } };
      for (const landmark of region.explore.landmarks) {
        expect(landmark.journal, path).toBeDefined();
        expect(alternatives(landmark.journal!).every((line) => line.length <= 80), path).toBe(true);
        expect(alternatives(landmark.text).some((line) => line.length > 80), path).toBe(true);
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { friendlyProblems, neededLabel } from "../../src/studio/issues";
import { StudioStore } from "../../src/studio/store";
import { entitySchemas, initialValue } from "../../src/studio/schema";
const problem = (path: string, message: string) => ({ file: "", path, message });
const schema = z.object({ id: z.string(), name: z.string(), category: z.enum(["material", "food", "water"]), hours: z.number() });
describe("Create problem presentation", () => {
  it.each([
    ["id", "ids are lowercase snake_case", "Use lowercase letters, digits and _ — and a new ID."],
    ["id", "Use a new, unique lowercase snake_case ID.", "Use lowercase letters, digits and _ — and a new ID."],
    ["name", "Required; enter a value.", "Required."],
    ["name", "Required", "Required."],
    ["category", "Invalid enum value. Expected 'material' | 'food' | 'water', received ''", "Choose one: material, food, water"],
    ["hours", "Number must be greater than 0", "Number must be greater than 0"],
  ])("maps %s: %s", (path, message, expected) => {
    const input = [problem(path, message)];
    expect(friendlyProblems(input, schema)).toEqual([problem(path, expected)]);
    expect(input[0].message).toBe(message);
  });
  it("uses issue metadata for undefined inputs and enum options, including custom Zod messages", () => {
    const missing = z.string({ required_error: "Custom missing value" }).safeParse(undefined);
    const choice = z.enum(["a", "b"], { errorMap: () => ({ message: "Custom enum" }) }).safeParse("");
    if (missing.success || choice.success) throw new Error("Expected invalid inputs");
    expect(friendlyProblems([
      { ...problem("name", missing.error.issues[0].message), issue: missing.error.issues[0] },
      { ...problem("category", choice.error.issues[0].message), issue: choice.error.issues[0] },
    ], schema)).toEqual([problem("name", "Required."), problem("category", "Choose one: a, b")].map((p, i) => ({ ...p, issue: i ? choice.error.issues[0] : missing.error.issues[0] })));
  });
  it("maps an empty required string even when a schema length issue comes first", () => {
    expect(friendlyProblems([problem("name", "String must contain at least 1 character(s)"), problem("name", "Required; enter a value.")], schema))
      .toEqual([problem("name", "Required.")]);
  });
  it("keeps the first message per path and preserves independent paths", () => {
    expect(friendlyProblems([problem("id", "ids are lowercase snake_case"), problem("id", "Required; enter a value."), problem("name", "Required")], schema))
      .toEqual([problem("id", "Use lowercase letters, digits and _ — and a new ID."), problem("name", "Required.")]);
  });
  it.each([
    ["quests", "completeWhen.all", "Done when"],
    ["regions", "climate.baseC", "Climate › Base C"],
    ["buildings", "build.hours", "Build › Hours"],
    ["quests", "completeWhen.all.0.any.1.not", "Done when"],
    ["quests", "completeWhen.all.0.stat", "Complete when › Stat"],
    ["items", "id", "ID"],
    ["items", "category", "Category"],
  ])("labels %s %s meaningfully", (kind, path, expected) => {
    expect(neededLabel(entitySchemas[kind], path)).toBe(expected);
  });
  it("retains the raw createProblems contract across all fixture kinds", () => {
    const root = join(import.meta.dirname, "../fixtures");
    const store = new StudioStore();
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const file = join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (entry.name.endsWith(".json")) store.disk.push({ path: relative(root, file), content: readFileSync(file, "utf8"), hash: file, encoding: "utf8" });
      }
    };
    walk(join(root, "content"));
    const results = Object.entries(entitySchemas).map(([kind, node]) => ({ kind,
      empty: store.createProblems(kind, initialValue(node)),
      fixtures: store.view.documents.filter(document => document.kind === kind).map(document => ({
        path: document.path, problems: store.createProblems(kind, document.raw), duplicate: store.createProblems(kind, document.raw, document.raw),
      })),
    }));
    // Recorded with the unchanged store implementation at base 94c94bf.
    expect(createHash("sha256").update(JSON.stringify(results)).digest("hex"))
      .toBe("d64c25d587fa0f0453459d17af1dc2a928c11a3550083cd7ad4a9710fd4daeec");
    expect(results).toHaveLength(9);
  });
});

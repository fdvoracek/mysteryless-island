import { describe, expect, it } from "vitest";
import { formatContent, isFormattedContent } from "../src/content/format";
import { buildRegistry } from "../src/content/registry";
import { readContentFiles } from "./helpers";

describe("canonical content formatter", () => {
  it("preserves raw JSON, comments, key order and nested arrays, and is idempotent", () => {
    const value = { z: { _note: "Comment with \"quotes\" and\na newline.", text: "x".repeat(100) }, a: [true, null, 0, [1, 2]] };
    const result = formatContent(value);
    expect(result).toBe(`{\n  "z": {\n    "_note": "Comment with \\"quotes\\" and\\na newline.",\n    "text": "${"x".repeat(100)}"\n  },\n  "a": [true, null, 0, [1, 2]]\n}\n`);
    expect(JSON.parse(result)).toEqual(value);
    expect(formatContent(JSON.parse(result))).toBe(result);
    expect(isFormattedContent(result)).toBe(true);
    expect(isFormattedContent(JSON.stringify(value))).toBe(false);
    expect(() => isFormattedContent("{broken")).toThrow(SyntaxError);
  });

  it("uses two spaces, keeps short children inline and wraps at 110 columns", () => {
    expect(formatContent({ a: [1, { b: 2 }] })).toBe('{ "a": [1, { "b": 2 }] }\n');
    expect(formatContent(["x".repeat(106)]).trimEnd()).toHaveLength(110);
    expect(formatContent(["x".repeat(107)])).toBe(`[\n  "${"x".repeat(107)}"\n]\n`);
    const value = { long: ["x".repeat(90), { small: true }] };
    expect(formatContent(value)).toBe(`{\n  "long": [\n    "${"x".repeat(90)}",\n    { "small": true }\n  ]\n}\n`);
  });
});

describe("one entity per file", () => {
  it("rejects legacy arrays and mismatched filenames for every entity kind", () => {
    const files = readContentFiles();
    for (const kind of ["items", "recipes", "buildings", "quests", "events", "sites", "artwork", "regions"]) {
      const path = Object.keys(files).find((p) => p.startsWith(`content/${kind}/`))!;
      expect(() => buildRegistry({ ...files, [path]: [files[path], files[path]] }), kind).toThrow(/Expected object, received array/);
      const renamed = { ...files };
      delete renamed[path];
      renamed[`content/${kind}/wrong_name.json`] = files[path];
      expect(() => buildRegistry(renamed), kind).toThrow(/wrong_name\.json: id: file name must equal id/);
    }
    for (const path of ["content/sites.json", "content/artwork.json"]) {
      expect(() => buildRegistry({ ...files, [path]: [] })).toThrow(/unsupported content file/);
    }
  });

  it("sorts observable kinds by order, then id for equal and missing orders, regardless of file enumeration", () => {
    const files = readContentFiles();
    for (const kind of ["items", "buildings", "quests", "events"] as const) {
      const paths = Object.keys(files).filter((p) => p.startsWith(`content/${kind}/`));
      // Events need several valid definitions to exercise both ties and missing order.
      if (kind === "events") {
        for (const id of ["order_z", "order_a", "order_c", "order_b"]) {
          const path = `content/events/${id}.json`;
          files[path] = { id, title: id, trigger: { when: { flag: "never" } }, scenes: { start: { text: "Test." } } };
          paths.push(path);
        }
      }
      for (const path of paths) delete (files[path] as { order?: number }).order;
      for (const path of paths.slice(0, 2)) (files[path] as { order?: number }).order = 20;
      const expected = paths.map((p) => files[p] as { id: string; order?: number }).sort((a, b) =>
        (a.order ?? Infinity) - (b.order ?? Infinity) || a.id.localeCompare(b.id)).map((v) => v.id);
      const reversed = Object.fromEntries(Object.entries(files).reverse());
      expect([...buildRegistry(reversed)[kind].keys()]).toEqual(expected);
      expect([...buildRegistry(files)[kind].keys()]).toEqual(expected);
    }
  });

  it("only accepts numeric order on observable list kinds", () => {
    const files = readContentFiles();
    for (const kind of ["items", "buildings", "quests", "events", "recipes", "sites", "artwork"]) {
      const path = Object.keys(files).find((p) => p.startsWith(`content/${kind}/`))!;
      const entity = files[path] as object;
      expect(() => buildRegistry({ ...files, [path]: { ...entity, order: "first" } })).toThrow();
      if (["recipes", "sites", "artwork"].includes(kind)) {
        expect(() => buildRegistry({ ...files, [path]: { ...entity, order: 10 } })).toThrow(/Unrecognized key/);
      }
    }
  });
});

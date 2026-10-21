import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildRegistry } from "../src/content/registry";
import { isFormattedContent } from "../src/content/format";
import { readContentFiles, readShippedContentFiles } from "./helpers";

it("shipped content satisfies the schema and all references resolve", () => {
  expect(() => buildRegistry(readShippedContentFiles())).not.toThrow();
});

it("shipped content and frozen fixtures use canonical formatting", () => {
  const unformatted: string[] = [];
  for (const [prefix, files] of [["../", readShippedContentFiles()], ["./fixtures/", readContentFiles()]] as const) {
    for (const path of Object.keys(files)) {
      const file = new URL(prefix + path, import.meta.url);
      if (!isFormattedContent(readFileSync(file, "utf8"))) unformatted.push(file.pathname);
    }
  }
  expect(unformatted, "Run npm run content:format").toEqual([]);
});

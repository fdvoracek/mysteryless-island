import { expect, it } from "vitest";
import { buildRegistry } from "../src/content/registry";
import { readShippedContentFiles } from "./helpers";

it("shipped content satisfies the schema and all references resolve", () => {
  expect(() => buildRegistry(readShippedContentFiles())).not.toThrow();
});

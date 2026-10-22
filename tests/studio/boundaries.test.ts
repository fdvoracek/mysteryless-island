import { expect, it } from "vitest";
import { ESLint } from "eslint";

it("enforces import boundaries for game, core, content and Studio", async () => {
  const lint = new ESLint();
  const bad = [
    ["src/core/invalid.ts", 'import "../ui/render";'],
    ["src/content/invalid.ts", 'export { writeSave } from "../persistence/save";'],
    ["src/core/invalid.ts", 'import "react";'],
    ["src/ui/invalid.ts", 'import "../studio/documents";'],
    ["src/studio/invalid.ts", 'import "../content/schema";'],
    ["src/studio/invalid.ts", 'import "../core/state";'],
    ["src/ui/invalid.ts", 'import("../studio/main");'],
    ["src/studio/invalid.ts", 'import "../persistence/save";'],
    ["src/core/invalid.ts", 'type X = import("../ui/render").X;'],
    ["src/studio/invalid.ts", 'type X = import("../content/schema").X;'],
    ["src/ui/invalid.tsx", 'const element = <div />;'],
  ];
  for (const [filePath, source] of bad) {
    const [result] = await lint.lintText(source, { filePath });
    expect(result.errorCount, `${filePath}: ${source}`).toBeGreaterThan(0);
  }
  for (const source of ['import "../content";', 'import "../content/index";', 'import "../core/engine";', 'import "react";']) {
    const [result] = await lint.lintText(source, { filePath: "src/studio/valid.ts" });
    expect(result.errorCount, source).toBe(0);
  }
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { loadRegistry, readContentFiles } from "./helpers";

/**
 * The browser test (e2e/smoke.spec.ts) only runs in CI and in the pre-push hook. This checks, with
 * the unit tests, that what it expects still exists in the content: a renamed task or id fails here
 * first (two CI failures came from a renamed task the browser test still expected).
 */
const rawSpec = readFileSync(join(__dirname, "..", "e2e", "smoke.spec.ts"), "utf8");
// Text extraction below parses raw TypeScript; these legacy replacements only scope ID scans.
const spec = rawSpec
  .replace(/test\(\s*"[^"]*"/g, "test(")
  .replace(/\/\/.*$/gm, "")
  .replace(/(expect\([^,()]*),\s*"[^"]*"\)/g, "$1)");
/** Extract text only from APIs that address player-facing labels. CSS properties,
 * screenshot options, event names, comments and test descriptions are not game vocabulary.
 * Resolve literal arrays and their for-of bindings so shared assertion/selector lists count too. */
function uiLabels(source: string): string[] {
  const file = ts.createSourceFile("smoke.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const values = (expression: ts.Node | undefined, scope: ts.Node): string[] => {
    if (!expression) return [];
    if (ts.isStringLiteralLike(expression)) return [expression.text];
    if (ts.isArrayLiteralExpression(expression)) return expression.elements.flatMap((item) => values(item, scope));
    if (ts.isIdentifier(expression)) {
      // Only resolve lexically enclosing for-of variables, never an unrelated variable
      // with the same name from a different test.
      for (let parent: ts.Node | undefined = scope; parent; parent = parent.parent) {
        if (ts.isForOfStatement(parent) && ts.isVariableDeclarationList(parent.initializer)
          && parent.initializer.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === expression.text)) {
          return values(parent.expression, parent.parent);
        }
      }
    }
    return [];
  };
  const labels: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && ["action", "tab"].includes(callee.text)) labels.push(...values(node.arguments[1], node));
      if (ts.isPropertyAccessExpression(callee)) {
        const method = callee.name.text;
        if (["toHaveText", "toContainText", "getByText", "getByLabel"].includes(method)) labels.push(...values(node.arguments[0], node));
        if (["locator", "filter", "getByRole"].includes(method)) {
          const options = node.arguments[method === "filter" ? 0 : 1];
          if (options && ts.isObjectLiteralExpression(options)) for (const property of options.properties) {
            if (ts.isPropertyAssignment(property)
              && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
              && ["hasText", "name"].includes(property.name.text)) labels.push(...values(property.initializer, node));
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  // Generated clocks, quantities and interpolated sentences have separate browser coverage.
  // This guard checks the plain labels historically covered by the content check.
  return [...new Set(labels.filter((label) => /^[a-z][a-z ]*[a-z]$/.test(label)))];
}

function missingLabels(source: string, known: (label: string) => boolean): string[] {
  return uiLabels(source).filter((label) => !known(label));
}

/** font ids and names (src/ui/fonts.ts) */
const uiNames = (() => {
  const files = [join(__dirname, "..", "src", "ui", "fonts.ts")];
  return new Set(files.filter((f) => f.endsWith(".ts")).flatMap((f) => [...readFileSync(f, "utf8").matchAll(/(?:id|name): "([^"]+)"/g)].map((m) => m[1])));
})();
const reg = loadRegistry();

/** every string in the content files (names, labels, words, texts) */
function contentStrings(): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") out.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(readContentFiles());
  return out;
}

describe("the browser test matches the content", () => {
  it("every id it uses (data-id, data-choice, tree targets) exists", () => {
    const ids = new Set<string>([
      ...reg.items.keys(), ...reg.regions.keys(), ...reg.activities.keys(), ...reg.quests.keys(),
      ...reg.buildings.keys(), ...reg.recipes.keys(), ...reg.discoveries.keys(), ...reg.events.keys(),
      ...reg.timers.keys(), ...reg.stats.stats.map((s) => s.id), "comfort",
    ]);
    // event choices of the shipwreck, and the pop-ups' own ids
    for (const ev of reg.events.values()) for (const sc of Object.values(ev.scenes)) sc.choices?.forEach((c) => ids.add(c.id));
    const used = [
      ...[...spec.matchAll(/data-(?:id|choice|target)="([^"$]+)"/g)].map((m) => m[1]),
      ...[...spec.matchAll(/(?:create|node)\(page, "(?:craft|build)", "([^"]+)"\)/g)].map((m) => m[1]),
    ];
    const unknown = used.filter((id) => {
      const [kind, rest] = id.includes(":") ? id.split(":") : ["", id];
      if (id === "close") return false;
      if (["go", "explore", "craft", "build"].includes(kind)) return !ids.has(rest);
      return !ids.has(id);
    });
    expect(unknown).toEqual([]);
  });

  it("every plain label it names (expected texts, buttons, places, tasks) exists in the content", () => {
    const strings = contentStrings();
    // Building-owned item controls qualify the verb with the item name.
    for (const item of reg.items.values()) for (const action of item.actions ?? []) {
      if (action.building) strings.add(`${action.label} ${item.name}`);
    }
    for (const building of reg.buildings.values()) strings.add(`personally build ${building.name}`);
    for (const recipe of reg.recipes.values()) strings.add(`personally craft ${recipe.label ?? reg.items.get(recipe.item)!.name}`);
    // words the UI and the test code write themselves
    const ui = new Set(["buildings", "consumables", "pause", "resume", "start a new game"]);

    const texts = [...strings];
    // a label exists, or a piece of a text (toContainText), or a font
    const known = (l: string) => strings.has(l) || ui.has(l) || uiNames.has(l) || texts.some((t) => t.includes(l));
    const missing = missingLabels(rawSpec, known);
    expect(missing).toEqual([]);
  });

});


describe("browser UI label extraction", () => {
  it("ignores technical API strings while checking actual text references", () => {
    const source = `
      test("invented test title", async () => {
        // action(page, "invented comment");
        await page.screenshot({ animations: "disabled", path: "invented screenshot" });
        await expect(button).toHaveCSS("color", "transparent");
        await expect(button).toHaveCSS("opacity", "inherit");
        await expect(button).toHaveAttribute("aria-disabled", "true");
        await page.getByRole("button", { name: "look around" }).click();
        await action(page, "look around").click();
        await expect(button).toHaveText("missing button label");
      });
    `;
    expect(uiLabels(source)).toEqual(["look around", "missing button label"]);
    expect(missingLabels(source, (label) => label === "look around")).toEqual(["missing button label"]);
  });

  it("detects renamed labels in assertion arrays, helper calls and selector loops", () => {
    const source = `
      await expect(rows).toHaveText(["knife", "missing inventory label"]);
      await tab(page, "missing place").click();
      await action(page, "missing action").click();
      await page.locator(".btn", { hasText: "missing selector label" }).click();
      await page.getByText("missing text label").click();
      await page.locator(".btn", { 'hasText': "missing quoted selector" }).click();
      await page.getByRole("button", { "name": "missing quoted role" }).click();
      for (const label of ["sleep", "missing loop action"]) await action(page, label).click();
      for (const label of ["knife", "missing loop assertion"]) await expect(row).toHaveText(label);
      for (const label of ["unrelated technical value"]) await page.screenshot({ animations: label });
    `;
    expect(missingLabels(source, (label) => ["knife", "sleep"].includes(label))).toEqual([
      "missing inventory label", "missing place", "missing action", "missing selector label",
      "missing text label", "missing quoted selector", "missing quoted role", "missing loop action", "missing loop assertion",
    ]);
  });
});

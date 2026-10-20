import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRegistry, readContentFiles } from "./helpers";

/**
 * The browser test (e2e/smoke.spec.ts) only runs in CI and in the pre-push hook. This checks, with
 * the unit tests, that what it expects still exists in the content: a renamed task or id fails here
 * first (two CI failures came from a renamed task the browser test still expected).
 */
// the test's own titles, comments and failure messages are not expectations
const spec = readFileSync(join(__dirname, "..", "e2e", "smoke.spec.ts"), "utf8")
  .replace(/test\(\s*"[^"]*"/g, "test(")
  .replace(/\/\/.*$/gm, "")
  .replace(/(expect\([^,()]*),\s*"[^"]*"\)/g, "$1)");
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
    const ui = new Set(["back", "map", "close", "here", "busy", "off", "new", "prologue", "ended",
      // browser and code words
      "buildings", "consumables", "pause", "resume",
      "pageerror", "console", "error", "meter", "style", "button", "true", "click", "italic", "title", "class",
      "start a new game", "craft", "build", "completed", "open", "details", "summary"]);
    // plain lowercase labels in quotes: "catch a fish", "the forest", "pick berries"; not "firewood 0/10"
    const labels = [...spec.matchAll(/"([a-z][a-z ]*[a-z])"/g)].map((m) => m[1]);
    const texts = [...strings];
    // a label exists, or a piece of a text (toContainText), or a font
    const known = (l: string) => strings.has(l) || ui.has(l) || uiNames.has(l) || texts.some((t) => t.includes(l));
    const missing = [...new Set(labels.filter((l) => !known(l)))];
    expect(missing).toEqual([]);
  });

});

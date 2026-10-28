import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, expect, it } from "vitest";
import { z } from "zod";
import { Activity, Artwork, Item, Site, Condition, Effect, Outcome, Text, formatContent } from "../../src/content";
import { Field } from "../../src/studio/form";
import { BUILDER_DEPTH, conditionPhrases, describe, effectPhrases, unionKinds } from "../../src/studio/describe";
import { readDocuments, type Document, type FileDocument } from "../../src/studio/documents";
import { schemaFor, stripComments, type Schema } from "../../src/studio/schema";
import { referenceLabel } from "../../src/studio/references";
import { placeholderMismatch, textChannel } from "../../src/studio/text";

const root = mkdtempSync(join(tmpdir(), "studio-widgets-"));
cpSync(new URL("../fixtures/content", import.meta.url), join(root, "content"), { recursive: true });
// The depth audit is read-only and uses a disposable copy of shipped content, too.
cpSync(new URL("../../content", import.meta.url), join(root, "shipped/content"), { recursive: true });
afterAll(() => rmSync(root, { recursive: true, force: true }));
function files(base: string): FileDocument[] {
  return readdirSync(join(base, "content"), { recursive: true, withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith(".json")).map(e => {
    const path = join(e.parentPath, e.name);
    return { path: relative(base, path), content: readFileSync(path, "utf8"), hash: "test", encoding: "utf8" };
  });
}
const documents = readDocuments(files(root)).documents;
const owner = documents.find(d => d.kind === "activities")!;
function render(schema: Schema, value: unknown, path = "requires", document: Document = owner) {
  return renderToStaticMarkup(createElement(Field, { schema, value, path, owner: document, documents, problems: [], onChange: () => { throw new Error("Render must not edit"); }, onError: () => {} }));
}
const conditions: Record<string, unknown> = {
  all: { all: [{ item: "knife" }] }, any: { any: [{ flag: "test" }] }, not: { not: { sheltered: false } },
  item: { item: "knife", gte: 1, lte: 3 }, seen: { seen: "knife" }, flag: { flag: "test" }, timer: { timer: "fire", gte: 1 },
  at: { at: "forest" }, region: { region: "forest" }, stat: { stat: "health", lte: 40 },
  warmth: { warmth: ["cold"] }, phase: { phase: ["morning"] }, effort: { effort: ["light", "work"] },
  day: { day: { gte: 1, lte: 4 } }, did: { did: "gather_wood", gte: 2 }, today: { today: "gather_wood" },
  reached: { reached: { day: 3, hour: 9 } }, quest: { quest: "build_snares", is: "active" }, discovered: { discovered: "cliff_shells" },
  explored: { explored: "forest", lte: 3 }, tool: { tool: "sharp" }, site: { site: "fishing" }, built: { built: "bed", here: true },
  sheltered: { sheltered: false }, building: { building: "bed", is: "idle" },
};
const effects: Record<string, unknown> = {
  give: { give: { knife: 1 } }, take: { take: { knife: 1 } }, stat: { stat: { health: -5 } }, timer: { timer: "fire", addHours: 2 },
  flag: { flag: "test" }, unflag: { unflag: "test" }, log: { log: ["One.", "Two."] },
  roll: { roll: [{ weight: 1, when: conditions.all, text: "Done.", effects: [{ roll: [{ weight: 2, effects: [{ give: { knife: 1 } }] }] }] }] },
  startQuest: { startQuest: "build_snares" }, unlock: { unlock: "forest" }, build: { build: "bed" }, startCycle: { startCycle: "bed", production: "fish", units: 2 },
};
it("iterates the Condition and Effect unions: every kind has a schema form and a phrase", () => {
  for (const [schema, examples, phrases, type] of [[Condition, conditions, conditionPhrases, "condition"], [Effect, effects, effectPhrases, "effect"]] as const) {
    const kinds = unionKinds(schema);
    expect(kinds.map(e => e.kind).sort()).toEqual(Object.keys(examples).sort());
    expect(kinds.map(e => e.kind).sort()).toEqual(Object.keys(phrases).sort());
    for (const { kind } of kinds) {
      expect(schema.safeParse(examples[kind]).success, kind).toBe(true);
      const html = render(schema, examples[kind]);
      expect(html, kind).toContain('aria-label="requires kind"');
      expect(html, kind).not.toContain("builder-fallback");
      expect(html, kind).not.toContain('spellCheck="false"');
      expect(describe(examples[kind], type, documents), kind).not.toMatch(/unknown|incomplete/);
    }
  }
});
it("resolves widgets through optional/lazy wrappers, including nested outcome fields", () => {
  expect(render(Condition.optional(), { item: "knife" })).toContain('aria-label="requires kind"');
  expect(render(Effect.optional(), { flag: "test" })).toContain('Effect kind');
  expect(render(Text.optional(), ["One.", "Two."])).toContain("Alternative variants");
  expect(render(Outcome.optional(), { weight: 1, when: { item: "knife" }, text: "Done." })).toContain('aria-label="requires.when kind"');
});
it("round-trips every fixture and shipped document without reaching the six-level fallback", () => {
  for (const base of [root, join(root, "shipped")]) for (const file of files(base)) {
    const document = readDocuments([file], false).documents[0];
    const raw = structuredClone(document.raw), before = formatContent(raw);
    const html = render(schemaFor(file.path)!, raw, "", document);
    expect(html, file.path).not.toContain("builder-fallback");
    expect(formatContent(raw), file.path).toBe(before);
    expect(document.raw, file.path).toEqual(raw);
  }
});
it("bounds recursive conditions and outcomes and retains unknown raw rules", () => {
  let value: unknown = { flag: "test" };
  for (let i = 0; i <= BUILDER_DEPTH; i++) value = { not: value };
  expect(render(Condition, value)).toContain("builder-fallback");
  expect(render(Condition, { future: "rule", _note: "keep" })).toContain("Unknown rule");
  expect(render(Effect, { future: "effect" })).toContain("Unknown rule");
  expect(render(Condition, { phase: [{ invalid: true }] })).toContain("textarea");
  let outcome: unknown = { weight: 1 };
  for (let i = 0; i <= BUILDER_DEPTH; i++) outcome = { weight: 1, effects: [{ roll: [outcome] }] };
  expect(render(Outcome, outcome)).toContain("builder-fallback");
  expect(render(Condition, { all: [] })).toContain("at least 1");
  expect(render(Outcome, { weight: -1 })).toContain("greater than or equal to 0");
});
it("summaries and pickers share reference labels and tolerate unknown IDs", () => {
  expect(referenceLabel("discovery", "cliff_shells", documents)).toBe("cliff_shells — the low cliff");
  expect(render(Condition, conditions.discovered)).toContain("cliff_shells — the low cliff");
  expect(describe(conditions.discovered, "condition", documents)).toContain("cliff_shells — the low cliff");
  expect(describe({ discovered: "missing" }, "condition", documents)).toBe("missing discovered");
  expect(describe({ region: "forest" }, "condition", documents)).toContain("unlocked");
  expect(describe({ stat: "health" }, "condition", documents)).toContain("any value");
  expect(describe({ reached: { day: 2, hour: 9.25 } }, "condition", documents)).toBe("reached day 2 at hour 9.25");
});
it("preserves three Text forms and plain newlines; warnings are non-mutating", () => {
  const journal = { ...owner, kind: "activities" };
  for (const text of ["One.\nTwo.", ["One.", "Two."], { _note: "keep", id: "test_text", variants: ["One.", "Two."] }]) {
    const before = formatContent(text);
    render(Text, text, "log", journal);
    expect(formatContent(text)).toBe(before);
  }
  expect(render(Text, ["x".repeat(81), "{item}"], "log", journal)).toContain("81 / 80 characters — above journal guidance");
  expect(render(Text, ["x".repeat(81), "{item}"], "log", journal)).toContain("different {placeholder} sets");
  expect(placeholderMismatch(["{a} {b} {a}", "{b} {a}"])).toBe(false);
  expect(render(Text, "x".repeat(81), "scenes.start.text", { ...owner, kind: "events" })).not.toContain("80 characters");
});
it("classifies narrative channels and leaves unlisted fields plain", () => {
  for (const [kind, path] of [["activities", "log"], ["recipes", "ways.0.log"], ["items", "consume.log"], ["buildings", "cycle.start.log"], ["activities", "outcomes.0.text"], ["events", "scenes.start.effects.0.roll.0.text"], ["quests", "startLog"], ["quests", "doneLog"], ["regions", "description"], ["regions", "firstVisit.log"], ["regions", "arrive.0.text"], ["settings", "sleep.recovery.ground.text"]]) expect(textChannel(kind, path), path).toBe("journal");
  for (const [kind, path] of [["events", "scenes.start.text"], ["regions", "explore.view.0.text"], ["regions", "explore.nothingLeft"], ["regions", "explore.landmarks.0.text"], ["settings", "newPlace.text"]]) expect(textChannel(kind, path), path).toBe("modal");
  expect(textChannel("items", "unknown")).toBe("text");
  expect(stripComments({ _note: "keep", all: [{ flag: "test" }] })).toEqual({ all: [{ flag: "test" }] });
});

it("renders activity hints, scalar rows and optional chips without editing the raw tree", () => {
  const activity = documents.find(d => d.id === "catch_fish")!;
  const before = formatContent(activity.raw);
  const html = render(Activity, activity.raw, "", activity);
  expect(html).toContain('>Visible when</label>');
  // The reference inside the composite condition keeps its path; widget names stay stable too.
  expect(html).toContain('aria-label="visibleWhen kind"');
  expect(html).toContain('aria-label="visibleWhen.discovered"');
  expect(render(z.object({ visibleWhen: z.string() }), { visibleWhen: "test" }, "")).toContain('aria-label="visibleWhen"');
  expect(html).toContain('class="field-help">Button appears</small>');
  const row = html.split('role="group" aria-label="Duration &amp; effort">')[1].split('data-field="visibleWhen"')[0];
  for (const key of ["hours", "effort", "icon"]) expect(row).toContain(`data-field="${key}"`);
  for (const caption of ["Hours", "Effort", "Icon"]) expect(row).toContain(`>${caption}</label>`);
  expect(row).toContain('class="field-unit">h</span>');
  expect(html).toContain('class="optional-fields"><span>Optional:</span>');
  for (const key of ["global", "building"]) expect(html).toContain(`class="optional-chip" type="button" aria-label="Add ${key}"`);
  expect(html).toContain('aria-label="Add building">+ Building</button>');
  const required = renderToStaticMarkup(createElement(Field, { schema: Activity, value: activity.raw, path: "", owner: activity, documents, problems: [], requiredOnly: true, onChange: () => { throw new Error("Render must not edit"); }, onError: () => {} }));
  expect(required).not.toContain('class="optional-fields"');
  expect(required).not.toContain('aria-label="Add building"');
  expect(formatContent(activity.raw)).toBe(before);
});

it("keeps a single set row member as its own grid field and unhinted fields visible", () => {
  const html = render(Item, { id: "test", name: "test", category: "material" }, "");
  expect(html).not.toContain('role="group"');
  expect(html).toMatch(/class="form-field field-scalar" data-field="category"/);
  expect(html).toContain('>Category</label>');
  expect(html).toContain('aria-label="Add max">+ Max carried</button>');
  expect(render(z.object({ newField: z.string() }), { newField: "value" }, "")).toContain('>New field</label>');
  const standalone = render(z.string().optional(), undefined, "explore");
  expect(standalone).toContain('class="optional-chip" type="button" aria-label="Add explore">+ Explore</button>');
  expect(standalone).not.toContain('class="optional-fields"');
});

it("groups rows in raw display order and keeps the underlying key order and comments", () => {
  const value = { id: "test", icon: "fish", _note: "keep", name: "test", effort: "work", hours: 1 };
  const before = formatContent(value);
  const html = render(Activity, value, "");
  expect(html.indexOf('aria-label="Duration &amp; effort"')).toBeLessThan(html.indexOf('_note (comment)'));
  expect(html.indexOf('data-field="icon"')).toBeLessThan(html.indexOf('data-field="effort"'));
  expect(html.indexOf('data-field="effort"')).toBeLessThan(html.indexOf('data-field="hours"'));
  expect(formatContent(value)).toBe(before);
});

it("renders site and artwork hints and keeps a locked ID textbox", () => {
  const artwork = { id: "test", src: "illustrations/test.png", width: 100, height: 50, alt: "Test" };
  const html = renderToStaticMarkup(createElement(Field, { schema: Artwork, value: artwork, path: "", owner, documents, problems: [], lockId: true, onChange: () => { throw new Error("Render must not edit"); }, onError: () => {} }));
  expect(html).toContain('field-locked" data-field="id"');
  expect(html).toMatch(/<input[^>]*readOnly=""[^>]*aria-label="id"/);
  expect(html).toContain('>Image path</label>');
  expect(html).toContain('role="group" aria-label="Size"');
  expect(html.match(/class="field-unit">px<\/span>/g)).toHaveLength(2);
  expect(render(Site, { id: "test", name: "test", needs: "Test" }, "")).toContain('class="field-help">Shown when the site is missing</small>');
});

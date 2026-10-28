import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, expect, it, vi } from "vitest";
import { z } from "zod";
import { Activity, Artwork, Item, Site, Condition, Effect, Outcome, Text, Quest, formatContent } from "../../src/content";
import { Field, fileContentsClass, rootSections } from "../../src/studio/form";
import { BUILDER_DEPTH, conditionPhrases, describe, effectPhrases, unionKinds } from "../../src/studio/describe";
import { readDocuments, type Document, type FileDocument } from "../../src/studio/documents";
import { schemaFor, stripComments, unwrap, type Schema } from "../../src/studio/schema";
import { referenceLabel } from "../../src/studio/references";
import { sections } from "../../src/studio/hints";
import { summarize } from "../../src/studio/summary";
import { readSections, rememberSection } from "../../src/studio/section-prefs";
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
  expect(render(Effect.optional(), { flag: "test" })).toContain('aria-label="requires kind"');
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
  expect(render(Text, ["x".repeat(81), "{item}"], "log", journal)).toContain('81/80<span class="visually-hidden"> — above journal guidance');
  expect(render(Text, ["x".repeat(81), "{item}"], "log", journal)).toContain("different {placeholder} sets");
  expect(placeholderMismatch(["{a} {b} {a}", "{b} {a}"])).toBe(false);
  expect(render(Text, "x".repeat(81), "scenes.start.text", { ...owner, kind: "events" })).not.toContain('class="variant-counter');
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
  const titles = ["Basics", "When can the player do this?", "Journal", "Results"];
  expect(html.match(/class="form-section"/g)).toHaveLength(4);
  let previous = -1;
  for (const title of titles) { const index = html.indexOf(`<strong>${title}</strong>`); expect(index).toBeGreaterThan(previous); previous = index; }
  const basics = html.split('<strong>Basics</strong>')[1].split('<strong>When can')[0];
  for (const key of ["name", "id", "hours", "effort", "icon"]) expect(basics).toContain(`data-field="${key}"`);
  expect(html.lastIndexOf('class="optional-fields"')).toBeGreaterThan(previous);
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
  expect(required).not.toContain('class="form-section"');
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

it("groups root rows in section order and keeps the underlying key order and comments", () => {
  const value = { id: "test", icon: "fish", _note: "keep", name: "test", effort: "work", hours: 1 };
  const before = formatContent(value);
  const html = render(Activity, value, "");
  expect(html.indexOf('aria-label="_note"')).toBeLessThan(html.indexOf('aria-label="Duration &amp; effort"'));
  expect(html.indexOf('data-field="hours"')).toBeLessThan(html.indexOf('data-field="effort"'));
  expect(html.indexOf('data-field="effort"')).toBeLessThan(html.indexOf('data-field="icon"'));
  expect(formatContent(value)).toBe(before);
});

it("groups rows in raw display order with hint-ordered members and preserves formatted key order", () => {
  const value = { name: "test", icon: "fish", id: "test", effort: "work", hours: 1 };
  const before = formatContent(value);
  const html = render(Activity, value, "activity");
  expect(html.indexOf('data-field="activity.name"')).toBeLessThan(html.indexOf('class="field-row"'));
  expect(html.indexOf('class="field-row"')).toBeLessThan(html.indexOf('data-field="activity.id"'));
  expect(html.indexOf('data-field="activity.hours"')).toBeLessThan(html.indexOf('data-field="activity.effort"'));
  expect(html.indexOf('data-field="activity.effort"')).toBeLessThan(html.indexOf('data-field="activity.icon"'));
  expect(formatContent(value)).toBe(before);
  expect(Object.keys(JSON.parse(formatContent(value)))).toEqual(["name", "icon", "id", "effort", "hours"]);
});

it("associates reference and flag labels with their controls and preserves multi-select group names", () => {
  for (const [schema, value, path, tag] of [
    [Activity.shape.building, "bed", "building", "select"],
    [z.string().describe("ref:flag"), "test", "flag", "input"],
  ] as const) {
    const html = render(schema, value, path);
    const id = html.match(/<label[^>]*for="([^"]+)"/)![1];
    expect(html).toContain(`<${tag} id="${id}" aria-label="${path}"`);
  }
  const html = render(unionKinds(Condition).find(entry => entry.kind === "phase")!.schema, { phase: ["morning"] }, "");
  expect(html).toContain('role="group" aria-label="phase"');
  expect(html).not.toContain("aria-labelledby");
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

it("keeps future schema fields in Other and sections off nested objects", () => {
  expect(render(Activity, {}, "")).not.toContain('class="form-section"');
  const schema = Activity.extend({ future: z.string() });
  const local = new Map([[schema, sections.get(Activity)!]]);
  try {
    for (const [node, value] of local) sections.set(node, value);
    const value = { id: "test", name: "test", hours: 1, future: "keep" };
    const html = render(schema, value, "");
    expect(html).toContain('<strong>Other</strong>');
    expect(html.split('<strong>Other</strong>')[1]).toContain('data-field="future"');
    expect(render(schema, value, "nested")).not.toContain('class="form-section"');
    expect(render(Activity, { id: "test", name: "test", hours: 1 }, "")).not.toContain('<strong>Journal</strong>');
  } finally { sections.delete(schema); }
});

it("summarizes schema node types through shared hints and descriptions", () => {
  const schema = Activity.extend({ text: Text, reference: z.string().describe("ref:item"), enabled: z.boolean(), list: z.array(z.string()), object: z.object({}), effects: z.array(Effect) });
  const summary = (key: string, value: unknown) => summarize(schema, { [key]: value }, [key], documents);
  expect(summary("name", "  " + "x".repeat(41) + "  ")).toBe("x".repeat(40) + "…");
  expect(summarize(Activity, { id: "skip", hours: 1 }, ["id", "hours"], documents)).toBe("1 h");
  expect(summary("enabled", true)).toBe("Enabled");
  expect(summary("enabled", false)).toBe("");
  expect(summary("effort", "work")).toBe("work");
  expect(summary("reference", "raw_fish")).toBe(referenceLabel("item", "raw_fish", documents));
  expect(summary("requires", { item: "knife" })).toBe("requires: " + describe({ item: "knife" }, "condition", documents));
  expect(summary("effects", [{ flag: "one" }, { unflag: "two" }])).toBe("set flag one, clear flag two");
  for (const text of [["First", "Second"], { id: "text", variants: ["First", "Second"] }, "First"]) expect(summary("text", text)).toBe("“First”");
  expect(summary("text", ["x".repeat(51)])).toBe("“" + "x".repeat(50) + "…”");
  expect(summary("list", ["a", "b"])).toBe("list: 2");
  expect(summary("object", {})).toBe("Object");
  expect(summarize(Activity, { visibleWhen: { discovered: "school_of_fish" } }, ["visibleWhen"], documents)).toBe("visible when: " + describe({ discovered: "school_of_fish" }, "condition", documents));
  expect(summarize(Activity, { tags: ["kindle"], outcomes: [{}, {}, {}] }, ["tags", "outcomes"], documents)).toBe("tags: 1 · outcomes: 3");
  expect(summarize(Item, { actions: [{}] }, ["actions"], documents)).toBe("item actions: 1");
  expect(summarize(Item, { actions: [{}, {}] }, ["actions"], documents)).toBe("item actions: 2");
});

it("places root string notes above fields/chips and retains nested and non-string comments", () => {
  const fire = documents.find(d => d.id === "strike_fire")!;
  const html = render(Activity, fire.raw, "", fire);
  expect(html).toContain('class="author-note"');
  expect(html).toContain('aria-label="_note"');
  expect(html.indexOf('aria-label="_note"')).toBeLessThan(html.indexOf('class="form-section"'));
  const value = { id: "test", name: "test", hours: 1, _hours: "Time note", _building: "Optional note", _raw: { keep: true } };
  const before = formatContent(value);
  const notes = render(Activity, value, "");
  expect(notes.indexOf('aria-label="_hours"')).toBeLessThan(notes.indexOf('data-field="hours"'));
  expect(notes.indexOf('aria-label="_building"')).toBeLessThan(notes.indexOf('aria-label="Add building"'));
  expect(notes).toContain('_raw (comment)');
  expect(render(Activity, { ...value, _note: "nested" }, "nested")).toContain('_note (comment)');
  expect(formatContent(value)).toBe(before);
  for (const node of [Site, Artwork]) {
    const plain = render(node, { id: "test", _note: "keep" }, "");
    expect(plain).toContain('aria-label="_note"');
    expect(plain).not.toContain('class="form-section"');
  }
});

it("defaults corrupt or blocked section storage to open and remembers valid titles", () => {
  let stored = "[]";
  const storage = { getItem: () => stored, setItem: (_: string, value: string) => { stored = value; } };
  for (const value of ["{", "null", "{}", '["Basics",3]']) { stored = value; expect(readSections("Activity", storage)).toEqual([]); }
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  expect(readSections("Activity", blocked)).toEqual([]);
  expect(() => rememberSection("Activity", "Basics", true, blocked)).not.toThrow();
  stored = "[]";
  rememberSection("Activity", "Basics", true, storage);
  expect(readSections("Activity", storage)).toEqual(["Basics"]);
  rememberSection("Activity", "Basics", false, storage);
  expect(readSections("Activity", storage)).toEqual([]);
});

it("counts section diagnostics only at exact key or descendant paths", () => {
  const activity = documents.find(d => d.id === "catch_fish")!;
  const html = renderToStaticMarkup(createElement(Field, { schema: Activity, value: activity.raw, path: "", owner: activity, documents, problems: ["log", "log.0", "logX", "hours"].map(path => ({ file: activity.path, path, message: "test" })), onChange: () => { throw new Error("Render must not edit"); }, onError: () => {} }));
  expect(html.match(/class="form-section-problems">2 problems/g)).toHaveLength(1);
  expect(html.match(/class="form-section-problems">1 problem/g)).toHaveLength(1);
});

it("initializes card DOM from stored collapsed titles and tolerates unavailable browser storage", () => {
  const activity = documents.find(d => d.id === "catch_fish")!;
  try {
    vi.stubGlobal("localStorage", { getItem: () => '["Basics"]', setItem: () => { throw new Error("Render must not write preferences"); } });
    let html = render(Activity, activity.raw, "");
    expect(html).toContain('<details class="form-section"><summary');
    expect(html.match(/<details class="form-section" open="">/g)).toHaveLength(3);
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); } });
    html = render(Activity, activity.raw, "");
    expect(html.match(/<details class="form-section" open="">/g)).toHaveLength(4);
  } finally { vi.unstubAllGlobals(); }
});

it("renders the bare file panel only for sectioned document roots in Form mode", () => {
  for (const [schema, value, mode, bare] of [
    [Activity, { name: "test", id: "test", hours: 1 }, "form", true],
    [Item, { name: "test", id: "test" }, "form", true],
    [Site, { name: "test", id: "test" }, "form", false],
    [Artwork, { id: "test", src: "test.png" }, "form", false],
    [Activity, { name: "test", id: "test" }, "json", false],
    [Activity, {}, "form", false],
    [Activity, { _note: "Only a note" }, "form", false],
    [Activity, null, "form", false],
  ] as const) {
    const html = renderToStaticMarkup(createElement("section", { className: fileContentsClass(schema, mode, value), "aria-label": "File contents" },
      mode === "form" ? createElement(Field, { schema, value, path: "", owner, documents, problems: [], onChange: () => { throw new Error("Render must not edit"); }, onError: () => {} }) : null));
    expect(html.includes('class="json-panel json-panel-bare"')).toBe(bare);
    expect(mode === "form" && Boolean(rootSections(schema, value)?.length)).toBe(bare);
    if (mode === "form") expect(html.includes('class="form-section"')).toBe(bare);
    expect(html).toContain('aria-label="File contents"');
  }
});

it("renders catch_fish as sentence rules, toggle pills and compact journal variants", () => {
  const activity = documents.find(d => d.id === "catch_fish")!;
  const raw = activity.raw as Record<string, unknown>;
  const visible = render(Condition, raw.visibleWhen, "visibleWhen", activity);
  expect(visible.match(/class="rule-line"/g)).toHaveLength(1);
  expect(visible).toContain('aria-label="visibleWhen kind"');
  expect(visible).toContain('rule-token token-discovery');
  expect(visible.match(/Reads as:/g)).toHaveLength(1);
  const requires = render(Condition, raw.requires, "requires", activity);
  expect(requires.match(/class="rule-line"/g)).toHaveLength(3);
  expect(requires.match(/class="rule"/g)).toHaveLength(1);
  expect(requires.match(/Reads as:/g)).toHaveLength(1);
  expect(requires).toContain('of these');
  expect(requires).toContain('rule-token token-item');
  for (const [key, caption] of [["gte", "at least"], ["lte", "at most"]]) expect(requires).toContain(`aria-label="Add ${key}">+ ${caption}</button>`);
  for (const id of ["dawn", "day", "dusk"]) expect(requires).toContain(`aria-label="requires.all.1.phase: ${id}" checked=""`);
  expect(requires).toContain('<span>+ night</span>');
  expect(requires).not.toContain('Condition / group kind');
  expect(requires).not.toContain('Optional:');
  const journal = render(Text, raw.log, "log", activity);
  expect(journal.match(/class="variant"/g)).toHaveLength(3);
  expect(journal.match(/class="variant-counter"/g)).toHaveLength(3);
  for (let i = 0; i < 3; i++) {
    expect(journal).toContain(`class="variant-index">${i + 1}</span>`);
    expect(journal).toContain(`aria-label="log.${i}" rows="1"`);
  }
  expect(journal).not.toContain('Alternative 1');
  expect(render(Text, { id: "named", variants: ["One."] }, "log", activity)).toContain('aria-label="log.id"');
});

it("keeps set optional ranges and own numeric objects inline with stable controls", () => {
  const leaf = render(Condition, { item: "knife", gte: 2 });
  expect(leaf).toContain('>at least</label>');
  expect(leaf).toContain('aria-label="requires.gte" type="number"');
  expect(leaf).toContain('aria-label="Unset requires.gte">×</button>');
  expect(leaf).not.toContain('>Unset</button>');
  expect(leaf).not.toContain('class="rule-block"');
  const reached = render(Condition, { reached: { day: 3, hour: 9 } });
  expect(reached).toContain('aria-label="requires.reached.day"');
  expect(reached).toContain('>day</label>');
  expect(reached).toContain('>hour</label>');
  expect(reached).not.toContain('>Reached</label>');
  expect(reached).not.toContain('class="rule-block"');
});

it("renders item amounts inline while keeping roll outcomes below the line", () => {
  const give = render(Effect, { give: { raw_fish: 2 } }, "outcomes.0.effects.0");
  expect(give).toContain('class="amount-token">raw_fish — raw fish</span>');
  expect(give).toContain('aria-label="outcomes.0.effects.0.give.raw_fish" type="number"');
  expect(give).toContain('aria-label="Remove outcomes.0.effects.0.give.raw_fish"');
  expect(give).toContain('aria-label="outcomes.0.effects.0.give new key"');
  expect(give).not.toContain('class="rule-block"');
  const roll = render(Effect, { roll: [{ weight: 1, effects: [{ give: { raw_fish: 1 } }] }] });
  expect(roll.indexOf('class="rule-block"')).toBeGreaterThan(roll.indexOf('class="rule-line"'));
  expect(roll).toContain('aria-label="requires.roll.0.weight"');
  expect(roll.match(/Reads as:/g)).toHaveLength(1);
});

it("renders scalar array lines with compact named actions and no element labels", () => {
  const html = render(Activity.shape.tags, ["kindle", "fire"], "tags");
  expect(html.match(/class="array-line"/g)).toHaveLength(2);
  expect(html).not.toMatch(/>[01]<\/label>|entry-index|array-entry/);
  for (const index of [0, 1]) {
    expect(html).toContain(`aria-label="tags.${index}"`);
    for (const action of ["Move up", "Move down", "Remove"]) expect(html).toContain(`aria-label="${action} tags.${index}"`);
  }
  expect(html).toContain('aria-label="Remove tags.0">×</button>');
  expect(html).toContain('aria-label="Add tags entry">+ add entry</button>');
});

it("renders numbered object blocks without boxes or element labels and resets array layout props", () => {
  const schema = Activity.shape.yields;
  const values = [{ item: "raw_fish", min: 1, max: 1 }, { item: "raw_fish", min: 2, max: 2 }];
  expect(schema.safeParse(values).success).toBe(true);
  const html = render(schema, values, "yields");
  expect(html.match(/class="array-object-entry"/g)).toHaveLength(2);
  for (const i of [1, 2]) expect(html).toContain(`class="entry-index" aria-hidden="true">${i}</span>`);
  expect(html).not.toMatch(/array-entry|>[01]<\/label>/);
  expect(html).toContain('aria-label="Add yields entry">+ add entry</button>');
  const inherited = renderToStaticMarkup(createElement(Field, {
    schema, value: values, path: "yields", inline: true,
    presentation: { schema, path: "yields", inline: true }, ruleFields: { ownKey: "item", caption: () => "wrong caption" },
    owner, documents, problems: [], onChange: () => { throw new Error("Render must not edit"); }, onError: () => {},
  }));
  const entries = inherited.slice(inherited.indexOf('class="array-object-entry"'));
  expect(entries).not.toMatch(/inline-object|rule-inline|wrong caption|>[01]<\/label>/);
  expect(entries).toContain('aria-label="yields.0.item"');
});

it("renders generic records with key tokens, values and named remove actions", () => {
  const html = render(z.record(z.string(), z.number()), { first: 2 }, "amounts");
  expect(html).toContain('class="record-row"');
  expect(html).toContain('class="record-key">first</span>');
  expect(html).toContain('aria-label="amounts.first" type="number"');
  expect(html).toContain('aria-label="Remove amounts.first">×</button>');
  expect(html).toContain('aria-label="amounts new key"');
  expect(html).toContain('>Add key</button>');
  expect(html).not.toContain("array-entry");
  const reference = render((unwrap(unionKinds(Effect).find(k => k.kind === "give")!.schema) as z.AnyZodObject).shape.give, { raw_fish: 2 }, "give");
  expect(reference).toContain('class="record-key record-reference">raw_fish — raw fish</span>');
});

it("places union kinds in their label line and labels a quest when trigger exactly once", () => {
  const html = render(Quest.shape.trigger, { when: { item: "knife" } }, "trigger");
  expect(html.match(/>Trigger<\/label>/g)).toHaveLength(1);
  const labelLine = html.slice(html.indexOf('class="field-label"'), html.indexOf('<div class="field-control">'));
  expect(labelLine).toContain('>Trigger</label>');
  expect(labelLine).toContain('class="union-kind"');
  expect(labelLine).toContain('>Value type</span>');
  expect(labelLine).toContain('aria-label="trigger kind"');
  expect(html).toContain('aria-label="trigger.when kind"');
  expect(render(Quest.shape.trigger, { when: { item: "knife" } }, "")).toContain('aria-label="root kind"');
});

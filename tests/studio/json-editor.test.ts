import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json } from "@codemirror/lang-json";
import { EditorState } from "@codemirror/state";
import { formatContent } from "../../src/content";
import { alternatives, toJsonSchema } from "../../src/studio/json-schema";
import { completions, hoverText } from "../../src/studio/json-complete";
import { DraftSync } from "../../src/studio/json-sync";
import { pathAt, positionOfPath, rangeOfPath, registryTextProblems, syntaxProblems } from "../../src/studio/json-text";
import { defaultMode, readMode, rememberMode } from "../../src/studio/editor-mode";
import { readDocuments } from "../../src/studio/documents";
import { schemaFor } from "../../src/studio/schema";
import { StudioStore, type Transport } from "../../src/studio/store";
import { temporaryPack } from "./pack";

const pack = temporaryPack();
afterAll(pack.cleanup);
const state = (doc: string) => EditorState.create({ doc, extensions: [json()] });
const at = (doc: string) => { const position = doc.indexOf("|"); return { s: state(doc.replace("|", "")), position }; };
const lineOf = (s: EditorState, from: number) => s.doc.lineAt(from).number;
const gameSchema = toJsonSchema(schemaFor("content/game.json")!);
const activitySchema = toJsonSchema(schemaFor("content/activities/gather_wood.json")!);
const noRefs = () => [] as string[];
const labels = (result: ReturnType<typeof completions>) => result?.options.map((o) => o.label) ?? [];

describe("JSON Schema from the Zod schemas", () => {
  it("describes objects, enums, references and recursive unions without a second traversal", () => {
    const [activity] = alternatives(activitySchema, activitySchema);
    expect(Object.keys(activity.properties!)).toContain("id");
    expect(JSON.stringify(activitySchema)).toContain('"x-ref":"item"');
    expect(JSON.stringify(activitySchema)).toContain('"enum":["heavy"');
    expect(activitySchema.$defs).toBeDefined();
    expect(() => JSON.stringify(activitySchema)).not.toThrow();
  });
  it("leaves unsupported nodes empty", () => {
    expect(alternatives(gameSchema, {})).toEqual([{}]);
  });
});

describe("syntax and registry problems in the text", () => {
  it("reports a syntax error at its line and column", () => {
    const s = state('{\n  "a": 1\n  "b": 2\n}\n');
    const [problem] = syntaxProblems(s);
    expect(problem.message).toContain("Invalid JSON");
    expect(lineOf(s, problem.from)).toBe(3);
  });
  it("reports a truncated document on its last line", () => {
    const s = state('{\n  "a": ');
    expect(lineOf(s, syntaxProblems(s)[0].from)).toBe(2);
  });
  it("flags a duplicate key at its line, which JSON.parse would silently drop", () => {
    const s = state('{\n  "a": 1,\n  "b": 2,\n  "a": 3\n}\n');
    expect(JSON.parse(s.doc.toString())).toEqual({ a: 3, b: 2 });
    const [problem] = syntaxProblems(s);
    expect(problem.message).toBe('Duplicate key "a": JSON.parse keeps only the last value');
    expect(lineOf(s, problem.from)).toBe(4);
  });
  it("maps a registry path to its line, the nearest ancestor when absent", () => {
    const raw = JSON.parse(pack.files.find((f) => f.path === "content/activities/gather_wood.json")!.content);
    raw.requires = { item: "missing_browser_test_item" };
    const text = formatContent(raw);
    const files = pack.files.map((f) => f.path === "content/activities/gather_wood.json" ? { ...f, content: text } : f);
    const problems = readDocuments(files).diagnostics.filter((p) => p.file === "content/activities/gather_wood.json");
    expect(problems.length).toBeGreaterThan(0);
    const s = state(text);
    const [mapped] = registryTextProblems(s, problems);
    expect(s.doc.lineAt(mapped.from).text).toContain("missing_browser_test_item");
    const absent = rangeOfPath(s, "requires.nothing_here");
    expect(s.doc.lineAt(absent.from).text).toContain('"item"');
    expect(rangeOfPath(s, "").from).toBe(0);
  });
  it("maps array indexes and record keys", () => {
    const s = state('{\n  "list": [\n    1,\n    { "x": 2 }\n  ],\n  "r": { "a.b": 3 }\n}\n');
    expect(lineOf(s, rangeOfPath(s, "list.1.x").from)).toBe(4);
    expect(lineOf(s, rangeOfPath(s, "r.a.b").from)).toBe(6);
  });
  it("round-trips a cursor through its JSON path", () => {
    const { s, position } = at('{\n  "a": { "b": [1, { "c": |true }] }\n}\n');
    const path = pathAt(s, position);
    expect(path).toEqual(["a", "b", "1", "c"]);
    const other = state('{\n\n\n  "a": { "b": [1, { "c": false }] }\n}\n');
    expect(other.sliceDoc(positionOfPath(other, path)!, positionOfPath(other, path)! + 3)).toBe('"c"');
    expect(other.sliceDoc(positionOfPath(other, ["a", "gone"])!, positionOfPath(other, ["a", "gone"])! + 1)).toBe("{");
  });
});

describe("schema completion", () => {
  it("offers keys of the object under the cursor, minus those already present", () => {
    const { s, position } = at('{\n  "id": "x",\n  |\n}');
    const result = completions(activitySchema, noRefs, s, position);
    expect(labels(result)).toContain('"hours"');
    expect(labels(result)).not.toContain('"id"');
  });
  it("completes a partly typed key by replacing the string", () => {
    const { s, position } = at('{\n  "ho|"\n}');
    const result = completions(activitySchema, noRefs, s, position)!;
    expect(s.sliceDoc(result.from, position)).toBe('"ho');
    expect(result.options.map((o) => o.label)).toContain('"hours"');
  });
  it("offers enum values and existing IDs for reference fields", () => {
    const refs = vi.fn(() => ["knife", "stone"]);
    const effort = at('{\n  "effort": |\n}');
    expect(labels(completions(activitySchema, refs, effort.s, effort.position))).toEqual(expect.arrayContaining(['"heavy"', '"rest"']));
    const item = at('{\n  "requires": { "item": "|" }\n}');
    const result = completions(activitySchema, refs, item.s, item.position);
    expect(labels(result)).toEqual(['"knife"', '"stone"']);
    expect(refs).toHaveBeenCalledWith("item", "requires.item");
  });
  it("completes reference record keys with existing IDs", () => {
    const refs = (kind: string) => kind === "item" ? ["knife", "stone"] : [];
    const { s, position } = at('{\n  "id": "x",\n  "ways": [\n    { "cost": { | } }\n  ]\n}');
    const keys = labels(completions(toJsonSchema(schemaFor("content/recipes/craft_axe.json")!), refs, s, position));
    expect(keys).toEqual(['"knife"', '"stone"']);
  });
  it("offers nothing where the schema has no help", () => {
    const { s, position } = at('{\n  "stepMinutes": |\n}');
    expect(completions(gameSchema, noRefs, s, position)).toBeNull();
    const unknown = at('{\n  "no_such_key": |\n}');
    expect(completions(gameSchema, noRefs, unknown.s, unknown.position)).toBeNull();
  });
  it("shows no hover text where the schema has no metadata", () => {
    const { s, position } = at('{\n  "stepMi|nutes": 15\n}');
    expect(hoverText(gameSchema, s, position)).toBeUndefined();
  });
});

describe("debounced draft sync", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  it("turns a burst of keystrokes into one store edit, one validation and one undo step", () => {
    const store = new StudioStore();
    store.disk = pack.files.map((f) => ({ ...f }));
    const path = "content/game.json";
    const original = store.disk.find((f) => f.path === path)!.content;
    let notifications = 0;
    store.subscribe(() => { notifications++; });
    const commit = vi.fn((text: string) => store.editJson(path, text));
    const sync = new DraftSync(commit, () => store.endTyping());
    for (let i = 0; i < 30; i++) { sync.push(original.replace('"stepMinutes": 15', `"stepMinutes": 1${i}`)); vi.advanceTimersByTime(10); }
    expect(commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(notifications).toBe(1);
    const validations = store.version;
    void store.view; void store.view;
    expect(store.version).toBe(validations);
    vi.advanceTimersByTime(200);
    sync.push(original.replace('"stepMinutes": 15', '"stepMinutes": 20'));
    vi.advanceTimersByTime(600);
    expect(store.past).toHaveLength(2);
    store.undo();
    expect(store.drafts.get(path)).toContain('"stepMinutes": 129');
    store.undo();
    expect(store.drafts.has(path)).toBe(false);
  });
  it("shares one checkpoint across commits of a continuing burst and flushes on blur", () => {
    const store = new StudioStore();
    store.disk = pack.files.map((f) => ({ ...f }));
    const path = "content/game.json";
    const original = store.disk.find((f) => f.path === path)!.content;
    const sync = new DraftSync((text) => store.editJson(path, text), () => store.endTyping());
    for (let i = 0; i < 5; i++) { sync.push(original.replace("15", `${20 + i}`)); vi.advanceTimersByTime(400); }
    expect(store.past).toHaveLength(1);
    sync.push(original.replace("15", "30"));
    sync.settle();
    expect(store.drafts.get(path)).toContain('"stepMinutes": 30');
    expect(sync.dirty).toBe(false);
  });
});

describe("saving JSON edits", () => {
  function setup() {
    let disk = pack.files.map((f) => ({ ...f }));
    const writes: { path: string; content: string }[] = [];
    const transport: Transport = async (url, init) => {
      if (!init?.method) return Response.json({ files: structuredClone(disk) });
      const path = url.replace("/__studio/files/", "");
      const body = JSON.parse(init.body as string);
      writes.push({ path, content: body.content });
      disk = disk.map((f) => f.path === path ? { ...f, content: body.content, hash: "h" + writes.length } : f);
      return Response.json({ hash: "h" + writes.length, changed: [path] });
    };
    const store = new StudioStore(transport); store.disk = structuredClone(disk);
    return { store, writes };
  }
  it("writes a minimal house-format diff for a game.json text edit and keeps comments and order", async () => {
    const { store, writes } = setup();
    const path = "content/game.json";
    const original = store.disk.find((f) => f.path === path)!.content;
    const edited = original.replace('"stepMinutes": 15', '"stepMinutes":   15').replace("Global game settings", "Global settings");
    store.editJson(path, edited);
    await store.save();
    expect(writes).toHaveLength(1);
    const before = original.split("\n"), after = writes[0].content.split("\n");
    expect(after).toHaveLength(before.length);
    const changed = after.map((line, i) => [line, before[i]]).filter(([a, b]) => a !== b);
    expect(changed).toEqual([[expect.stringContaining('"_note": "Global settings, start state'), expect.stringContaining('"_note": "Global game settings, start state')]]);
    expect(writes[0].content).toBe(formatContent(JSON.parse(writes[0].content)));
    expect(Object.keys(JSON.parse(writes[0].content))).toEqual(Object.keys(JSON.parse(original)));
  });
  it("blocks Save on a syntax error and on a duplicate key", () => {
    const { store } = setup();
    const path = "content/game.json";
    const original = store.disk.find((f) => f.path === path)!.content;
    store.editJson(path, original.replace("{", "{ broken"));
    expect(store.canSave).toBe(false);
    expect(store.inputErrors.size).toBe(1);
    expect(store.view.diagnostics).toEqual([]);
    const edited = original.replace("Global game settings", "Global settings");
    store.editJson(path, edited);
    expect(store.canSave).toBe(true);
    store.editJson(path, edited.replace('"stepMinutes": 15,', '"stepMinutes": 15,\n  "stepMinutes": 20,'));
    store.setJsonProblem(path, 'Duplicate key "stepMinutes"');
    expect(store.canSave).toBe(false);
    store.setJsonProblem(path, "");
    store.editJson(path, edited);
    expect(store.canSave).toBe(true);
  });
  it("keeps malformed text as a buffer, leaves the last valid draft, and shares one undo step", () => {
    const { store } = setup();
    const path = "content/items/knife.json";
    const original = store.disk.find((f) => f.path === path)!.content;
    store.editJson(path, "{broken");
    expect(store.buffersFor(path)[""]?.text).toBe("{broken");
    expect(store.view.diagnostics).toEqual([]);
    store.editJson(path, "{broken again");
    store.editJson(path, original);
    expect(store.inputErrors.size).toBe(0);
    expect(store.drafts.has(path)).toBe(false);
    expect(store.past).toHaveLength(1);
    store.editJson(path, "{broken");
    store.undo();
    expect(store.buffers.size).toBe(0);
    store.redo();
    expect(store.buffersFor(path)[""]?.text).toBe("{broken");
  });
  it("leaves registry-invalid JSON unsavable", () => {
    const { store } = setup();
    const path = "content/activities/gather_wood.json";
    const raw = JSON.parse(store.disk.find((f) => f.path === path)!.content);
    raw.requires = { item: "missing_browser_test_item" };
    store.editJson(path, formatContent(raw));
    expect(store.canSave).toBe(false);
  });
});

describe("remembered editor mode", () => {
  const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
  it("opens settings in JSON and everything else in the form", () => {
    expect(["settings", "regions", "activities", "items", "events", "trees"].map(defaultMode)).toEqual(["json", "form", "form", "form", "form", "form"]);
    const storage = memory();
    expect(readMode("content/stats.json", "settings", storage)).toBe("json");
    expect(readMode("content/items/knife.json", "items", storage)).toBe("form");
  });
  it("remembers the last choice per file", () => {
    const storage = memory();
    rememberMode("content/items/knife.json", "json", storage);
    rememberMode("content/game.json", "form", storage);
    expect(readMode("content/items/knife.json", "items", storage)).toBe("json");
    expect(readMode("content/game.json", "settings", storage)).toBe("form");
    expect(readMode("content/items/stone.json", "items", storage)).toBe("form");
  });
  it("ignores bad or unavailable storage", () => {
    const storage = { getItem: () => "sideways", setItem: () => { throw new Error("blocked"); } };
    expect(readMode("content/game.json", "settings", storage)).toBe("json");
    expect(() => rememberMode("content/game.json", "form", storage)).not.toThrow();
    expect(readMode("content/game.json", "settings", { getItem: () => { throw new Error("blocked"); }, setItem: () => {} })).toBe("json");
  });
});

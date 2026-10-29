import { FormContext, type FieldProps, type FormContextValue } from "../../src/studio/form";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { formatContent, type ContentProblem } from "../../src/content";
import { Field, widgetRegistry } from "../../src/studio/form";
import { CreateDialog } from "../../src/studio/dialogs";
import { StudioStore, permitsSave, type Transport } from "../../src/studio/store";
import { branches, entitySchemas, identityFields, initialValue, schemaFor, visitValue } from "../../src/studio/schema";
import { referenceOptions, references, whereUsed } from "../../src/studio/references";
import type { FileDocument } from "../../src/studio/documents";

// All Studio tests read only this disposable copy, never shipped content or frozen originals.
const root = mkdtempSync(join(tmpdir(), "studio-editor-"));
cpSync(new URL("../fixtures/content", import.meta.url), join(root, "content"), { recursive: true });
afterAll(() => rmSync(root, { recursive: true, force: true }));
function fixtureFiles(): FileDocument[] {
  const files: FileDocument[] = [];
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".json")) files.push({ path: relative(root, path), content: readFileSync(path, "utf8"), hash: name, encoding: "utf8" });
    }
  }
  walk(join(root, "content")); return files;
}
function setup() {
  let disk = fixtureFiles();
  const writes: { path: string; body: Record<string, unknown>; method: string }[] = [];
  let failAt = "", stale = false;
  const transport: Transport = async (url, init) => {
    if (!init?.method) return Response.json({ files: structuredClone(disk) });
    const path = url.replace("/__studio/files/", "");
    const body = JSON.parse(init.body as string);
    writes.push({ path, body, method: init.method });
    if (path === failAt) return Response.json({ error: "test failure" }, { status: 500 });
    const original = disk.find((file) => file.path === path);
    if (stale || (original?.hash ?? null) !== body.expectedHash) { stale = false; return Response.json({ error: "changed" }, { status: 409 }); }
    disk = disk.filter((file) => file.path !== path);
    const hash = `saved-${writes.length}`;
    if (init.method === "PUT") disk.push({ path, content: body.content, hash, encoding: "utf8" });
    return Response.json({ hash, changed: [path] });
  };
  const store = new StudioStore(transport); store.disk = structuredClone(disk);
  return { store, writes, fail: (path: string) => { failAt = path; }, stale: () => { stale = true; }, external: (path: string, raw: unknown) => { const file = disk.find((f) => f.path === path)!; file.content = formatContent(raw); file.hash += "external"; } };
}
function raw(store: StudioStore, path: string) { return structuredClone(store.view.documents.find((d) => d.path === path)!.raw) as Record<string, unknown>; }
const itemPath = "content/items/knife.json";

describe("schema-driven forms and draft documents", () => {
  it("renders every fixture file without mutating its raw tree, comments, union branch or formatting", () => {
    const { store } = setup();
    const before = store.files.map((file) => file.content);
    for (const owner of store.view.documents) {
      const schema = schemaFor(owner.path)!;
      const original = structuredClone(owner.raw);
      const html = renderToStaticMarkup(formElement(Field, { schema, value: owner.raw, path: "", problems: [], documents: store.view.documents, owner, onChange: () => { throw new Error("Rendering must not edit content"); }, onError: () => {} }));
      expect(html.length, owner.path).toBeGreaterThan(0);
      expect(owner.raw).toEqual(original);
      store.edit(owner.path, owner.raw);
      expect(store.drafts.has(owner.path), owner.path).toBe(false);
      visitValue(schema, owner.raw, ({ schema, value }) => { if (branches(schema).length) expect(branches(schema).some((option) => option.safeParse(strip(value)).success)).toBe(true); });
    }
    expect(store.files.map((file) => file.content)).toEqual(before);
  });
  it("generates the create dialog for every independent entity kind and rejects malformed/duplicate IDs", () => {
    const { store } = setup();
    for (const [kind, schema] of Object.entries(entitySchemas)) {
      const owner = store.view.documents.find((d) => d.kind === kind)!;
      const html = renderToStaticMarkup(createElement(CreateDialog, { store, kind, close: () => {}, created: () => {} }));
      expect(html).toContain('aria-label="Create kind"');
      expect(html).toContain('aria-label="id"');
      expect(store.createProblems(kind, initialValue(schema)).length).toBeGreaterThan(0);
      const invalid = { ...(owner.raw as object), id: "Bad ID" };
      expect(store.createProblems(kind, invalid).some((p) => p.path === "id")).toBe(true);
      expect(store.createProblems(kind, owner.raw).some((p) => p.path === "id")).toBe(true);
    }
  });
  it("keeps prefill and requires replacements for all nested IDs when duplicating", () => {
    const { store } = setup();
    for (const kind of ["regions", "buildings", "items", "events"]) {
      const owner = store.view.documents.filter((d) => d.kind === kind).find((d) => identityFields(entitySchemas[kind], d.raw).length > 1);
      if (!owner) continue;
      const duplicate = { ...(structuredClone(owner.raw) as object), id: `copy_${owner.id}` };
      const nested = identityFields(entitySchemas[kind], duplicate).filter((f) => f.path !== "id");
      expect(nested.length).toBeGreaterThan(0);
      const problems = store.createProblems(kind, duplicate, owner.raw);
      for (const field of nested) expect(problems.some((p) => p.path === field.path), field.path).toBe(true);
    }
    const prefill = { id: "new_area", name: "new area", title: "New area", description: "A place.", climate: { baseC: 12 }, travelHours: 1, activities: [], unlockWhen: { discovered: "cliff_shells" } };
    const path = store.create("regions", prefill);
    expect(raw(store, path).unlockWhen).toEqual(prefill.unlockWhen);
    expect(store.disk.some((f) => f.path === path)).toBe(false);
    const text = { ...raw(store, itemPath), id: "text_copy", actions: [{ id: "new_action", label: "act", hours: 1, effort: "light", effects: [{ log: { id: "existing_text", variants: ["A."] } }] }] };
    store.create("items", text);
    expect(store.createProblems("items", { ...text, id: "another_copy" }).some((p) => p.path.endsWith(".id"))).toBe(true);
  });
  it("walks contextual references and record keys and blocks deletion with source locations", () => {
    const { store } = setup(), documents = store.view.documents;
    const knife = documents.find((d) => d.path === itemPath)!;
    const used = whereUsed(documents, knife);
    expect(used).toContainEqual(expect.objectContaining({ file: "content/events/shipwreck.json", path: expect.stringContaining("give.knife") }));
    expect(references(documents)).toContainEqual(expect.objectContaining({ kind: "activity", file: "content/regions/beach.json", path: "activities.0" }));
    expect(() => store.delete(itemPath)).toThrow("referenced");
    expect(() => store.delete("content/game.json")).toThrow("Singleton");
  });
  it("keeps reference pickers usable when their source collections have invalid edits", () => {
    const { store } = setup();
    store.edit("content/game.json", { ...raw(store, "content/game.json"), timers: "invalid" });
    store.edit("content/stats.json", { ...raw(store, "content/stats.json"), stats: "invalid" });
    store.edit("content/climate.json", { ...raw(store, "content/climate.json"), phases: "invalid", bodyBands: "invalid" });
    const documents = store.view.documents, owner = documents.find((d) => d.path === itemPath)!;
    for (const kind of ["timer", "stat", "phase", "band"]) expect(referenceOptions(kind, documents, owner)).toEqual([]);
    expect(store.canSave).toBe(false);
  });
  it("supports widget overrides and unsupported-node raw JSON fallback", () => {
    const { store } = setup(), owner = store.view.documents[0];
    const props = { value: ["a", 2], path: "future", problems: [], documents: store.view.documents, owner, onChange: () => {}, onError: () => {} };
    const schema = z.tuple([z.string(), z.number()]);
    expect(renderToStaticMarkup(formElement(Field, { ...props, schema }))).toContain("textarea");
    widgetRegistry.nodes.set(schema, () => "custom schema widget");
    expect(renderToStaticMarkup(formElement(Field, { ...props, schema }))).toContain("custom schema widget");
    widgetRegistry.nodes.delete(schema);
    const union = z.discriminatedUnion("type", [z.object({ type: z.literal("a"), name: z.string() }), z.object({ type: z.literal("b"), count: z.number() })]);
    expect(renderToStaticMarkup(formElement(Field, { ...props, schema: union, value: { type: "b", count: 2 } }))).toContain("Kind (type)");
  });
});
function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  return value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith("_")).map(([key, child]) => [key, strip(child)])) : value;
}

describe("whole-pack saves", () => {
  it("stages an activity and area link and saves both canonically with expected hashes", async () => {
    const { store, writes } = setup();
    const path = store.create("activities", { id: "test_activity", name: "test activity", hours: 1, effort: "light", _note: "keep me" });
    expect(store.canSave).toBe(false);
    expect(writes).toEqual([]);
    const areaPath = "content/regions/forest.json", area = raw(store, areaPath);
    area.activities = [...area.activities as string[], "test_activity"]; store.edit(areaPath, area);
    expect(store.canSave).toBe(true);
    const result = await store.save();
    expect(result).toEqual({ written: [path, areaPath], notWritten: [] });
    expect(writes[0].body.expectedHash).toBe(null);
    expect(writes[1].body.expectedHash).toBe("forest.json");
    for (const write of writes) expect(write.body.content).toBe(formatContent(JSON.parse(write.body.content as string)));
    expect(writes[0].body.content).toContain('"_note": "keep me"');
    expect(store.drafts.size).toBe(0);
  });
  it("shows structured field errors, blocks invalid edits and undo/redo restores draft state", async () => {
    const { store, writes } = setup();
    store.edit(itemPath, { ...raw(store, itemPath), max: -1 });
    expect(store.view.diagnostics).toContainEqual(expect.objectContaining({ file: itemPath, path: "max" }));
    expect(store.canSave).toBe(false);
    await expect(store.save()).rejects.toThrow("validation");
    store.undo(); expect(store.drafts.size).toBe(0);
    store.redo(); expect(store.canSave).toBe(false);
    expect(writes).toEqual([]);
  });
  it("permits only strict diagnostic reduction, refusing new diagnostics even when fewer remain", async () => {
    const { store, external } = setup();
    const original = raw(store, itemPath);
    external(itemPath, { ...original, max: -1, category: "bad" }); await store.refresh();
    const base = store.baseline;
    store.edit(itemPath, { ...original, max: -1 });
    expect(store.canSave).toBe(true);
    const problem = (path: string): ContentProblem => ({ file: "file", path, message: path });
    expect(permitsSave([problem("a"), problem("b")], [problem("c")])).toBe(false);
    store.edit(itemPath, { ...original, artwork: "new_missing_artwork" });
    expect(store.canSave).toBe(false);
    await expect(store.save()).rejects.toThrow();
    store.edit(itemPath, original); expect(store.canSave).toBe(true);
    expect(base.length).toBeGreaterThan(0);
    expect((await store.save()).written).toEqual([itemPath]);
  });
  it("reports partial sequential writes and keeps every unwritten draft", async () => {
    const { store, writes, fail } = setup();
    const second = "content/items/stone.json";
    store.edit(itemPath, { ...raw(store, itemPath), name: "edited knife" });
    store.edit(second, { ...raw(store, second), name: "edited stone" });
    fail(second);
    expect(await store.save()).toEqual({ written: [itemPath], notWritten: [second] });
    expect(store.status).toContain(`Written: ${itemPath}. Not written: ${second}`);
    expect(store.drafts.has(second)).toBe(true); expect(store.drafts.has(itemPath)).toBe(false);
    expect(writes.map((w) => w.path)).toEqual([itemPath, second]);
  });
  it("retains drafts on refresh and 409, requires explicit overwrite, and fetches a fresh hash", async () => {
    const { store, writes, external, stale } = setup();
    store.edit(itemPath, { ...raw(store, itemPath), name: "mine" });
    external(itemPath, { ...raw(store, itemPath), name: "theirs" }); await store.refresh();
    expect(store.conflicts.has(itemPath)).toBe(true); expect(raw(store, itemPath).name).toBe("mine");
    expect((await store.save()).written).toEqual([]); expect(writes).toHaveLength(0);
    store.resolve(itemPath, "mine"); expect((await store.save()).written).toEqual([]);
    stale(); expect((await store.save(true)).written).toEqual([]);
    expect(store.conflicts.get(itemPath)?.choice).toBeUndefined();
    store.resolve(itemPath, "mine"); await store.save(true);
    expect(writes.at(-1)?.body.expectedHash).toBe("knife.jsonexternal");
    expect(store.drafts.size).toBe(0);
  });
  it("preserves malformed JSON buffers in history and rejects saves until repaired", () => {
    const { store } = setup();
    const source = JSON.stringify(raw(store, itemPath), null, 2);
    store.error(itemPath, "", "Invalid JSON", { text: "{bad", source });
    expect(store.buffersFor(itemPath)[""].text).toBe("{bad");
    expect(store.canSave).toBe(false); expect(store.drafts.size).toBe(1);
    expect(store.validated).toBeUndefined();
    store.undo(); expect(store.buffers.size).toBe(0); expect(store.drafts.size).toBe(0);
    store.redo(); expect(store.buffersFor(itemPath)[""].text).toBe("{bad");
    store.error(itemPath, "", ""); expect(store.drafts.size).toBe(0);
  });
  it("restores the conflict when undo brings back a draft discarded by disk reload", async () => {
    const { store, external } = setup();
    store.edit(itemPath, { ...raw(store, itemPath), name: "mine" });
    external(itemPath, { ...raw(store, itemPath), name: "theirs" }); await store.refresh();
    store.resolve(itemPath, "reload"); expect(store.drafts.size).toBe(0);
    store.undo(); expect(raw(store, itemPath).name).toBe("mine");
    expect(store.conflicts.has(itemPath)).toBe(true);
    expect((await store.save()).written).toEqual([]);
  });
  it("ignores a delayed refresh begun before a completed save", async () => {
    const fixture = setup();
    const oldFiles = structuredClone(fixture.store.disk);
    let release!: (response: Response) => void;
    let reads = 0;
    const store = new StudioStore((input, init) => {
      if (!init?.method && ++reads === 1) return new Promise<Response>((resolve) => { release = resolve; });
      return fixture.store.transport(input, init);
    });
    store.disk = structuredClone(oldFiles);
    const delayed = store.refresh();
    store.edit(itemPath, { ...raw(store, itemPath), name: "saved knife" });
    await store.save();
    release(Response.json({ files: oldFiles })); await delayed;
    expect(raw(store, itemPath).name).toBe("saved knife");
    expect(store.disk.find((file) => file.path === itemPath)?.hash).toBe("saved-1");
  });
  it("stages unreferenced deletion and supports undo before writing", async () => {
    const { store } = setup();
    const path = store.create("items", { id: "delete_test", name: "delete test", category: "material" });
    store.delete(path); expect(store.drafts.size).toBe(0);
    store.undo(); expect(store.drafts.has(path)).toBe(true);
  });
});

function formElement<P extends FieldProps>(component: ComponentType<P>, props: P & FormContextValue) {
  const { documents, owner, problems, buffers, onError, requiredOnly, lockId, ...field } = props;
  return createElement(FormContext.Provider, { value: { documents, owner, problems, buffers, onError, requiredOnly, lockId } },
    createElement(component, field as unknown as P));
}

import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { formatContent } from "../../src/content";
import { StudioStore, type Transport } from "../../src/studio/store";
import { identities, whereUsed, references, resolvesTo, deletionReferences } from "../../src/studio/references";
import { RESERVED_IDENTITIES } from "../../src/studio/reserved";
import { renamePlan, replaceAt } from "../../src/studio/rename";
import type { FileDocument } from "../../src/studio/documents";

const STUDIO_ROOT = mkdtempSync(join(tmpdir(), "studio-rename-"));
cpSync(new URL("../fixtures/content", import.meta.url), join(STUDIO_ROOT, "content"), { recursive: true });
afterAll(() => rmSync(STUDIO_ROOT, { recursive: true, force: true }));
function fixtureFiles(): FileDocument[] {
  const result: FileDocument[] = [];
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".json")) result.push({ path: relative(STUDIO_ROOT, path), content: readFileSync(path, "utf8"), hash: name, encoding: "utf8" });
    }
  }
  walk(join(STUDIO_ROOT, "content")); return result;
}
const baselineFiles = fixtureFiles();
function setup() {
  let disk = structuredClone(baselineFiles), fail = "", revision = 0;
  const operations: { method: string; path: string; expectedHash: string | null }[] = [];
  const transport: Transport = async (url, init) => {
    if (!init?.method) return Response.json({ files: structuredClone(disk) });
    const path = url.slice("/__studio/files/".length), body = JSON.parse(String(init.body));
    operations.push({ method: init.method, path, expectedHash: body.expectedHash });
    if (path === fail) return Response.json({ error: "injected failure" }, { status: 500 });
    const from = path.replace(/\/rename$/, ""), file = disk.find(f => f.path === from);
    if ((file?.hash ?? null) !== body.expectedHash) return Response.json({ error: "stale" }, { status: 409 });
    const hash = `revision-${++revision}`;
    if (init.method === "POST") {
      if (!file || disk.some(f => f.path === body.path)) return Response.json({ error: "destination exists" }, { status: 409 });
      disk = disk.filter(f => f.path !== from); disk.push({ ...file, path: body.path, hash });
    } else {
      disk = disk.filter(f => f.path !== path);
      if (init.method === "PUT") disk.push({ path, hash, content: body.content, encoding: "utf8" });
    }
    return Response.json({ hash });
  };
  const store = new StudioStore(transport); store.disk = structuredClone(disk);
  return { store, operations, disk: () => disk, external: (path: string) => {
    const file = disk.find(f => f.path === path)!;
    file.content = formatContent({ ...JSON.parse(file.content), name: "changed on disk" }); file.hash += "-external";
  }, fail: (path: string) => { fail = path; } };
}
const areaPath = "content/regions/forest.json";

describe("precise rename and reference ownership", () => {
  it("rejects every reserved identity before staging drafts or undo history", () => {
    const { store } = setup();
    const definitions = identities(store.view.documents);
    for (const entry of RESERVED_IDENTITIES) {
      const targets = definitions.filter(d => d.kind === entry.kind && d.id === entry.id);
      expect(targets.length, `${entry.kind}:${entry.id}`).toBeGreaterThan(0);
      for (const target of targets) {
        expect(target.reserved).toBe(entry.reason);
        expect(() => store.rename(target.file, target.path, "reserved_replacement")).toThrow(entry.reason);
        expect(store.drafts.size).toBe(0); expect(store.moves.size).toBe(0); expect(store.past).toHaveLength(0);
      }
    }
  });
  it("rewrites the sleep memory's existing today reference when gather_wood is renamed", () => {
    const { store } = setup();
    const plan = renamePlan(store.view.documents, "content/activities/gather_wood.json", "id", "renamed_wood");
    expect(plan.changes).toContainEqual(expect.objectContaining({ file: "content/activities/sleep.json", path: "thoughts.1.lines.21.when.today" }));
    store.rename("content/activities/gather_wood.json", "id", "renamed_wood");
    const sleep = store.view.documents.find(d => d.path === "content/activities/sleep.json")!;
    expect(sleep.content).toContain('"today": "renamed_wood"');
    expect(sleep.content).not.toContain('"today": "gather_wood"');
    expect(store.view.diagnostics).toEqual([]);
  });

  it("renames every entity, landmark and nested identity in the fixture pack without unrelated changes", () => {
    const original = setup().store;
    const definitions = identities(original.view.documents);
    expect(definitions.some(d => d.kind === "discovery")).toBe(true);
    expect(definitions.some(d => d.kind === "step")).toBe(true);
    expect(definitions.some(d => d.kind === "itemAction")).toBe(true);
    for (const [index, definition] of definitions.entries()) {
      if (definition.reserved) continue;
      const { store } = setup(), before = store.view.documents;
      const nextId = `renamed_identity_${index}`;
      const plan = renamePlan(before, definition.file, definition.path, nextId);
      const destination = store.rename(definition.file, definition.path, nextId);
      expect(store.view.diagnostics, `${definition.file} › ${definition.path}`).toEqual([]);
      const nextDefinition = identities(store.view.documents).find(d => d.file === destination && d.id === nextId)!;
      expect(nextDefinition).toBeDefined();
      expect(references(store.view.documents).some(ref => ref.id === definition.id && resolvesTo(ref, definition, store.view.documents))).toBe(false);
      // Reverse exactly the enumerated definition/reference changes. Everything else,
      // including comments, key order, prose and coincidentally equal local IDs, must match.
      for (const document of before) {
        const next = store.view.documents.find(d => d.path === (document.path === definition.file ? destination : document.path))!;
        let expected = document.raw;
        for (const change of plan.changes.filter(c => c.file === document.path)) expected = replaceAt(expected, change.path, nextId, change.key);
        expect(next.content, `${definition.file} › ${definition.path}: ${document.path}`).toBe(expected === document.raw ? document.formatted : formatContent(expected));
      }
      expect(store.past).toHaveLength(1);
      store.undo(); expect(store.files).toEqual(original.files); expect(store.moves.size).toBe(0);
      store.redo(); expect(store.view.diagnostics).toEqual([]);
    }
  }, 20000);
  it("resolves landmark references separately from their area, including references in the same area", () => {
    const { store } = setup(), docs = store.view.documents, forest = docs.find(d => d.path === areaPath)!;
    const landmark = identities(docs).find(d => d.file === areaPath && d.kind === "discovery")!;
    expect(whereUsed(docs, forest, landmark.path).some(ref => ref.kind === "discovery")).toBe(true);
    expect(whereUsed(docs, forest).every(ref => ref.kind !== "discovery")).toBe(true);
    store.edit(areaPath, { ...forest.raw as object, unlockWhen: { discovered: landmark.id } });
    expect(whereUsed(store.view.documents, store.view.documents.find(d => d.path === areaPath)!, landmark.path)).toContainEqual(expect.objectContaining({ file: areaPath, path: "unlockWhen.discovered" }));
    expect(deletionReferences(docs, forest).length).toBeGreaterThan(0);
    expect(() => store.delete(areaPath)).toThrow("referenced");
  });
  it("rejects malformed, claimed nested/local IDs and activity or consume tags before staging", () => {
    const { store } = setup();
    const activity = store.view.documents.find(d => d.kind === "activities")!;
    const item = store.view.documents.find(d => d.kind === "items" && (d.raw as { consume?: object }).consume)!;
    store.edit(activity.path, { ...activity.raw as object, tags: ["activity_tag_reserved"] });
    const raw = item.raw as { consume: object };
    store.edit(item.path, { ...raw, consume: { ...raw.consume, tags: ["consume_tag_reserved"] } });
    const before = new Map(store.drafts), history = store.past.length;
    for (const id of ["Bad ID", "activity_tag_reserved", "consume_tag_reserved", ...identities(store.view.documents).map(d => d.id)]) {
      expect(() => store.rename(areaPath, "id", id), id).toThrow();
      expect(store.drafts).toEqual(before); expect(store.past).toHaveLength(history);
    }
  });
  it("scopes scene, production and tree-branch references to their owners and keeps start reserved", () => {
    const { store } = setup();
    for (const [id, product] of [["one", "same_output"], ["two", "same_output"]]) store.create("buildings", { id: `local_${id}`, name: id, build: { hours: 1, effort: "light" }, cycle: { start: { id: `start_${id}`, label: "start", hours: 1, effort: "light", effects: [{ startCycle: `local_${id}`, production: product }] }, collect: { id: `collect_${id}`, label: "collect", hours: 1, effort: "light" }, hours: 1, products: { [product]: [] }, words: { idle: "idle", working: "working", ready: "ready" } } });
    // Use valid copies of an existing event and building rather than changing frozen fixtures.
    const event = store.view.documents.find(d => d.kind === "events")!;
    const eventRaw = event.raw as { scenes: Record<string, object> };
    store.edit(event.path, { ...eventRaw, scenes: { ...eventRaw.scenes, local_scene: { text: "A scene.", choices: [{ id: "local_choice", label: "return", next: "local_scene" }] } } });
    const tree = store.view.documents.find(d => d.kind === "trees" && (d.raw as { kind: string }).kind === "build")!;
    const treeRaw = tree.raw as { nodes: object[]; branches: { id: string }[] };
    store.edit(tree.path, { ...treeRaw, nodes: [...treeRaw.nodes, ...["one", "two"].map(id => ({ target: `local_${id}`, branch: treeRaw.branches[0].id, after: [], order: 999 }))] });
    expect(store.view.diagnostics).toEqual([]);
    store.rename("content/buildings/local_one.json", "cycle.products.same_output", "new_output");
    const one = store.view.documents.find(d => d.id === "local_one")!.content;
    const two = store.view.documents.find(d => d.id === "local_two")!.content;
    expect(one).not.toContain("same_output"); expect(two).toContain("same_output");
    store.rename(event.path, "scenes.local_scene", "new_scene");
    expect(store.view.diagnostics).toEqual([]);
    expect(store.view.documents.find(d => d.path === event.path)!.content).toContain('"next": "new_scene"');
    expect(() => store.rename(event.path, "scenes.start", "new_start")).toThrow("the engine opens every event at the start scene");
  });
});

describe("rename file moves and recovery", () => {
  it("coalesces chained renames and cancels the file move when renamed back before saving", () => {
    const { store } = setup(), from = "content/activities/gather_wood.json";
    const next = store.rename(from, "id", "renamed_wood");
    const last = store.rename(next, "id", "twice_renamed_wood");
    expect([...store.moves]).toEqual([[from, last]]);
    expect(store.view.diagnostics).toEqual([]);
    store.rename(last, "id", "gather_wood");
    expect(store.moves.size).toBe(0); expect(store.drafts.size).toBe(0);
    store.undo(); expect([...store.moves]).toEqual([[from, last]]);
    expect(store.view.diagnostics).toEqual([]);
  });
  it("keeps conflicting rename drafts grouped until Undo or an explicit expected-hash overwrite", async () => {
    const fixture = setup(), { store } = fixture, from = "content/activities/gather_wood.json";
    const next = store.rename(from, "id", "renamed_wood");
    fixture.external(from); await store.refresh();
    expect((await store.save()).written).toEqual([]); expect(fixture.operations).toHaveLength(0);
    const drafts = new Map(store.drafts);
    store.resolve(from, "reload"); expect(store.drafts).toEqual(drafts); expect(store.moves.get(from)).toBe(next);
    expect(store.status).toContain("Undo the pending rename");
    store.resolve(from, "mine"); await store.save(true);
    expect(fixture.operations[0]).toEqual({ method: "POST", path: from + "/rename", expectedHash: "gather_wood.json-external" });
    expect(store.view.diagnostics).toEqual([]); expect(store.drafts.size).toBe(0);
  });

  it("moves before writing in deterministic order with expected hashes and one undo step", async () => {
    const fixture = setup(), { store, operations } = fixture;
    const from = "content/activities/gather_wood.json", to = "content/activities/renamed_wood.json";
    const oldHash = store.disk.find(f => f.path === from)!.hash;
    store.rename(from, "id", "renamed_wood"); expect(store.past).toHaveLength(1);
    expect(await store.save()).toEqual({ written: [from, to, "content/activities/sleep.json", areaPath], notWritten: [] });
    expect(operations).toEqual([
      { method: "POST", path: from + "/rename", expectedHash: oldHash },
      { method: "PUT", path: to, expectedHash: "revision-1" },
      { method: "PUT", path: "content/activities/sleep.json", expectedHash: "sleep.json" },
      { method: "PUT", path: areaPath, expectedHash: "forest.json" },
    ]);
    expect(fixture.disk().some(f => f.path === from)).toBe(false);
    expect(store.view.diagnostics).toEqual([]); expect(store.moves.size).toBe(0);
  });
  it("retains only the new filename on failure between move and write and completes on retry", async () => {
    const fixture = setup(), { store } = fixture;
    const from = "content/activities/gather_wood.json", to = "content/activities/renamed_wood.json";
    store.rename(from, "id", "renamed_wood"); fixture.fail(to);
    expect(await store.save()).toEqual({ written: [from], notWritten: [to, "content/activities/sleep.json", areaPath] });
    expect(fixture.disk().filter(f => [from, to].includes(f.path)).map(f => f.path)).toEqual([to]);
    expect(JSON.parse(fixture.disk().find(f => f.path === to)!.content).id).toBe("gather_wood");
    expect(store.status).toContain("new filename exists; old filename absent");
    expect(store.drafts.has(to)).toBe(true); expect(store.canSave).toBe(true);
    expect(store.past).toHaveLength(0);
    fixture.fail(""); await store.save(); expect(store.view.diagnostics).toEqual([]);
    expect(store.drafts.size).toBe(0); expect(fixture.operations.filter(op => op.method === "POST")).toHaveLength(1);
  });
  it("retains only the old filename when the move fails", async () => {
    const fixture = setup(), { store } = fixture;
    const from = "content/activities/gather_wood.json", to = "content/activities/renamed_wood.json";
    store.rename(from, "id", "renamed_wood"); fixture.fail(from + "/rename");
    expect((await store.save()).written).toEqual([]);
    expect(fixture.disk().filter(f => [from, to].includes(f.path)).map(f => f.path)).toEqual([from]);
    expect(store.status).toContain("old filename retained"); expect(store.moves.get(from)).toBe(to);
  });
});

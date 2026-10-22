import { createHash } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { StudioStore } from "../../src/studio/store";
import { deriveStory } from "../../src/studio/story";
import { identities } from "../../src/studio/references";
import { LAYOUT_PATH, nodeKey, parseLayout, serializeLayout, type Pins } from "../../src/studio/layout-file";
import type { FileDocument } from "../../src/studio/documents";
import { temporaryPack } from "./pack";
const pack = temporaryPack();
afterAll(pack.cleanup);
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const prefix = "/__studio/files";

/** An in-memory stand-in for the file API: expected hashes, 409s, renames and injected failures. */
function memoryApi(initial: FileDocument[]) {
  const files = new Map(initial.map(f => [f.path, { ...f, hash: sha(f.content) }]));
  const calls: { method: string; path: string; expectedHash?: string | null }[] = [];
  const state = { failNext: 0 };
  const transport = async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") return Response.json({ files: [...files.values()] });
    if (state.failNext > 0) { state.failNext--; return Response.json({ error: "boom" }, { status: 500 }); }
    const rename = url.endsWith("/rename"), path = url.slice(prefix.length + 1, rename ? -7 : undefined), body = JSON.parse(String(init!.body));
    calls.push({ method: rename ? "RENAME" : method, path, expectedHash: body.expectedHash });
    if (body.expectedHash !== (files.get(path)?.hash ?? null)) return Response.json({ error: "File changed on disk" }, { status: 409 });
    if (rename) { const file = files.get(path)!; files.delete(path); files.set(body.path, { ...file, path: body.path }); return Response.json({ changed: [path, body.path], hash: file.hash }); }
    if (method === "DELETE") { files.delete(path); return Response.json({ changed: [path] }); }
    const hash = sha(body.content); files.set(path, { path, content: body.content, encoding: "utf8", hash });
    return Response.json({ changed: [path], hash });
  };
  const layout = () => { const f = files.get(LAYOUT_PATH); return f ? parseLayout(f.content).pins : undefined; };
  return { files, calls, state, transport, layout, writeLayout: (pins: Pins) => files.set(LAYOUT_PATH, { path: LAYOUT_PATH, content: serializeLayout(pins), encoding: "utf8", hash: sha(serializeLayout(pins)) }) };
}
async function open(extra: FileDocument[] = []) {
  const api = memoryApi([...structuredClone(pack.files), ...extra]);
  const store = new StudioStore(api.transport);
  store.layoutDelay = 0;
  store.reconcile(await store.readDisk());
  return { api, store };
}
const settle = async (store: StudioStore) => { await new Promise(r => setTimeout(r, 5)); await store.flushLayout(); };

describe("pin autosave", () => {
  it("creates the file with a null hash, then updates with the returned hash, outside the draft flow", async () => {
    const { api, store } = await open();
    expect(store.pinned).toEqual({});
    store.pin("quest:climb_cliff", { x: 10.4, y: -20.6 });
    expect(store.layoutStatus).toBe("pending");
    expect(store.drafts.size).toBe(0); expect(store.canSave).toBe(false); expect(store.past).toHaveLength(0);
    await settle(store);
    expect(store.layoutStatus).toBe("saved");
    expect(api.layout()).toEqual({ "quest:climb_cliff": { x: 10, y: -21 } });
    store.pin("region:forest", { x: 1, y: 2 });
    await settle(store);
    expect(api.calls.map(c => [c.method, c.path, c.expectedHash === null])).toEqual([["PUT", LAYOUT_PATH, true], ["PUT", LAYOUT_PATH, false]]);
    expect(api.calls[1].expectedHash).toBe(sha(serializeLayout({ "quest:climb_cliff": { x: 10, y: -21 } })));
    // The layout file is never a content document and never part of the content pack.
    expect(store.disk.some(f => f.path === LAYOUT_PATH)).toBe(false);
    expect(store.view.documents.some(d => d.path === LAYOUT_PATH)).toBe(false);
    expect(store.view.diagnostics).toEqual([]);
  });
  it("coalesces a burst into one write and writes nothing for an unchanged pin or an empty reset", async () => {
    const { api, store } = await open();
    store.layoutDelay = 20;
    store.pin("quest:a", { x: 1, y: 1 }); store.pin("quest:b", { x: 2, y: 2 }); store.pin("quest:a", { x: 3, y: 3 });
    await new Promise(r => setTimeout(r, 80)); await store.flushLayout();
    expect(api.calls).toHaveLength(1);
    store.pin("quest:a", { x: 3.2, y: 2.9 }); store.resetPins(); store.resetPins();
    await settle(store);
    expect(api.layout()).toEqual({});
    const { api: fresh, store: other } = await open();
    other.resetPins(); other.unpin("quest:a"); await settle(other);
    expect(fresh.calls).toEqual([]); expect(other.layoutStatus).toBe("idle");
  });
  it("is never blocked by content errors, and does not make a content draft", async () => {
    const { api, store } = await open();
    const doc = store.view.documents.find(d => d.kind === "quests")!;
    store.editJson(doc.path, "{ not json");
    expect(store.canSave).toBe(false); expect(store.inputErrors.size).toBeGreaterThan(0);
    store.pin("quest:climb_cliff", { x: 5, y: 6 });
    await settle(store);
    expect(store.layoutStatus).toBe("saved");
    expect(api.layout()).toEqual({ "quest:climb_cliff": { x: 5, y: 6 } });
    expect([...store.drafts.keys()]).toEqual([doc.path]);
  });
  it("on a 409 reloads the layout and reapplies the pending pins", async () => {
    const { api, store } = await open();
    store.pin("quest:first", { x: 1, y: 1 }); store.pin("quest:other", { x: 8, y: 8 }); await settle(store);
    api.writeLayout({ "quest:first": { x: 1, y: 1 }, "region:theirs": { x: 9, y: 9 }, "quest:other": { x: 7, y: 7 } });
    store.pin("quest:mine", { x: 4, y: 4 }); store.unpin("quest:other"); store.pin("quest:first", { x: 2, y: 2 });
    await settle(store);
    expect(store.layoutStatus).toBe("saved");
    expect(api.layout()).toEqual({ "quest:first": { x: 2, y: 2 }, "quest:mine": { x: 4, y: 4 }, "region:theirs": { x: 9, y: 9 } });
    expect(store.pinned).toEqual(api.layout());
    expect(api.calls.some(c => c.method === "PUT" && c.expectedHash !== null)).toBe(true);
  });
  it("reports a failed write, keeps the pending pins and succeeds on retry", async () => {
    const { api, store } = await open();
    api.state.failNext = 1;
    store.pin("region:forest", { x: 3, y: 4 });
    await new Promise(r => setTimeout(r, 20)); // the autosave timer fires once and fails
    expect(store.layoutStatus).toBe("failed"); expect(api.layout()).toBeUndefined();
    expect(store.pinned).toEqual({ "region:forest": { x: 3, y: 4 } });
    await store.flushLayout();
    expect(store.layoutStatus).toBe("saved"); expect(api.layout()).toEqual({ "region:forest": { x: 3, y: 4 } });
  });
  it("adopts pins from disk, ignores a damaged file, and replaces it when the owner drags", async () => {
    const good = { path: LAYOUT_PATH, content: serializeLayout({ "quest:climb_cliff": { x: 1, y: 2 } }), encoding: "utf8" as const, hash: "x" };
    const { store } = await open([good]);
    expect(store.pinned).toEqual({ "quest:climb_cliff": { x: 1, y: 2 } });
    const broken = { ...good, content: "{ nope" };
    const { api, store: other } = await open([broken]);
    expect(other.pinned).toEqual({}); expect(other.layoutProblem).toMatch(/not valid JSON/);
    other.pin("region:forest", { x: 1, y: 1 }); await settle(other);
    expect(api.layout()).toEqual({ "region:forest": { x: 1, y: 1 } }); expect(other.layoutProblem).toBe("");
    // A refresh with nothing pending shows an external edit; a refresh with pending pins keeps them.
    api.writeLayout({ "region:meadows": { x: 5, y: 5 } });
    await other.refresh();
    expect(other.pinned).toEqual({ "region:meadows": { x: 5, y: 5 } });
  });
  it("Unpin removes one pin and Reset clears all of them", async () => {
    const { api, store } = await open();
    for (const [i, id] of ["quest:a", "quest:b", "quest:c"].entries()) store.pin(id, { x: i, y: i });
    await settle(store);
    store.unpin("quest:b"); await settle(store);
    expect(Object.keys(api.layout()!)).toEqual(["quest:a", "quest:c"]);
    store.resetPins(); await settle(store);
    expect(api.layout()).toEqual({});
  });
});

describe("renames and deletions", () => {
  const renamable = (store: StudioStore, kind: string) => {
    const documents = store.view.documents, nodes = new Set(deriveStory(documents).nodes.map(n => n.id));
    return identities(documents).find(id => nodeKey(id)?.startsWith(`${kind}:`) && nodes.has(nodeKey(id)!) && !id.reserved && id.id !== "start")!;
  };
  it.each(["quest", "discovery", "region", "event"])("a renamed %s keeps its pin: shown at once, written with the rename's content save", async kind => {
    const { api, store } = await open();
    const target = renamable(store, kind), from = nodeKey(target)!, to = nodeKey(target, "renamed_node")!;
    store.pin(from, { x: 123, y: 45 }); await settle(store);
    const calls = api.calls.length;
    store.rename(target.file, target.path, "renamed_node");
    expect(store.pinned).toEqual({ [to]: { x: 123, y: 45 } });
    expect(api.calls).toHaveLength(calls); expect(api.layout()).toEqual({ [from]: { x: 123, y: 45 } });
    // undo removes the staged rename together with the content change
    store.undo(); expect(store.pinned).toEqual({ [from]: { x: 123, y: 45 } });
    store.redo(); expect(store.pinned).toEqual({ [to]: { x: 123, y: 45 } });
    await store.save();
    expect(api.layout()).toEqual({ [to]: { x: 123, y: 45 } });
    expect(store.layoutRenames).toEqual([]); expect(store.layoutStatus).toBe("saved");
    // the pin moved with the node: it exists in the saved story
    expect(deriveStory(store.view.documents).nodes.some(n => n.id === to)).toBe(true);
  });
  it("a node dragged after its rename keeps the new position", async () => {
    const { api, store } = await open();
    const target = renamable(store, "quest"), from = nodeKey(target)!, to = nodeKey(target, "renamed_node")!;
    store.pin(from, { x: 1, y: 1 }); await settle(store);
    store.rename(target.file, target.path, "renamed_node");
    store.pin(to, { x: 50, y: 60 });
    await store.save();
    expect(api.layout()).toEqual({ [to]: { x: 50, y: 60 } });
  });
  it("Unpin after a staged rename removes the pin under both names", async () => {
    const { api, store } = await open();
    const target = renamable(store, "quest"), from = nodeKey(target)!, to = nodeKey(target, "renamed_node")!;
    store.pin(from, { x: 1, y: 1 }); await settle(store);
    store.rename(target.file, target.path, "renamed_node");
    store.unpin(to); await settle(store);
    expect(store.pinned).toEqual({}); expect(api.layout()).toEqual({});
  });
  it("deleting a node prunes its pin when the content is saved, and keeps the others", async () => {
    const { api, store } = await open();
    const documents = store.view.documents;
    const doomed = documents.filter(d => d.kind === "quests").map(d => d.id).find(id => { try { const probe = new StudioStore(); probe.disk = structuredClone(pack.files); probe.delete(probe.view.documents.find(d => d.id === id)!.path); return true; } catch { return false; } })!;
    expect(doomed).toBeTruthy();
    store.pin(`quest:${doomed}`, { x: 1, y: 2 }); store.pin("region:forest", { x: 3, y: 4 }); store.pin("quest:never_existed", { x: 5, y: 6 }); await settle(store);
    store.delete(documents.find(d => d.id === doomed)!.path);
    // staged only: nothing pruned before the content is saved
    expect(api.layout()).toHaveProperty([`quest:${doomed}`]);
    await store.save();
    expect(api.layout()).toEqual({ "region:forest": { x: 3, y: 4 } });
    expect(api.files.has(`content/quests/${doomed}.json`)).toBe(false);
  });
  it("never prunes from a partial story when a content file does not parse", async () => {
    const { api, store } = await open();
    store.pin("quest:climb_cliff", { x: 1, y: 1 }); await settle(store);
    store.disk = store.disk.map(f => f.path.includes("quests/climb_cliff") ? { ...f, content: "{ broken" } : f);
    store.edit(store.view.documents.find(d => d.kind === "items")!.path, store.view.documents.find(d => d.kind === "items")!.raw);
    (store as unknown as { settleLayout: () => void }).settleLayout();
    await store.flushLayout();
    expect(api.layout()).toEqual({ "quest:climb_cliff": { x: 1, y: 1 } });
  });
});

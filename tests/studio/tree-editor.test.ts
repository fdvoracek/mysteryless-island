import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, expect, it } from "vitest";
import { formatContent } from "../../src/content";
import { StudioStore } from "../../src/studio/store";
import { GraphList } from "../../src/studio/graph";
import { TreeEditor } from "../../src/studio/tree-editor";
import { addBranch, addParent, blockerLabel, cyclePath, deletionBlockers, nextOrder, placeNode, removeBranch, removeParent, setNode, treeDocument, treeGraph, unplaced, updateBranch, type TreeRaw } from "../../src/studio/tree";
import { temporaryPack } from "./pack";
const pack = temporaryPack(); afterAll(pack.cleanup);
function setup() { const store = new StudioStore(); store.disk = structuredClone(pack.files); return store; }
const tree = (store: StudioStore, kind: "craft" | "build") => treeDocument(store.view.documents, kind)!;
const draftTree = (store: StudioStore, kind: "craft" | "build") => JSON.parse(store.drafts.get(tree(store, kind).path)!) as TreeRaw;
const recipe = (id: string) => ({ id, item: "axe", ways: [{ hours: 1, effort: "work", cost: { firewood: 1 }, log: "You work." }] });
const diskTree = (kind: "craft" | "build") => JSON.parse(pack.files.find(f => f.path === `content/trees/${kind === "craft" ? "crafting" : "building"}.json`)!.content) as TreeRaw;

it("renders and round-trips both fixture trees unchanged, with list and graph exposing the same nodes and edges", () => {
  const store = setup(), before = structuredClone(store.files), documents = store.view.documents;
  const html = renderToStaticMarkup(createElement(TreeEditor, { documents, edit: () => { throw new Error("Rendering must not edit"); }, open: () => {}, rename: () => {}, newHere: () => {} }));
  expect(html).toContain("only the prerequisites are authoritative"); expect(html).toContain("existing saves keep their earned unlocks");
  for (const kind of ["craft", "build"] as const) {
    const owner = tree(store, kind), graph = treeGraph(owner, documents), raw = owner.raw as TreeRaw;
    expect(graph.nodes.map(n => n.id)).toEqual(raw.nodes.map(n => n.target));
    expect(graph.edges.map(e => [e.source, e.target])).toEqual(raw.nodes.flatMap(n => n.after.map(p => [p, n.target])));
    const list = renderToStaticMarkup(createElement(GraphList, { graph, node: () => {} }));
    for (const n of graph.nodes) expect(list).toContain(`data-node="${n.id}"`);
    for (const e of graph.edges) expect(list).toContain(`data-edge="${e.id}"`);
    expect(unplaced(documents, owner)).toEqual([]);
    store.edit(owner.path, owner.raw); expect(store.drafts.size).toBe(0);
  }
  expect(store.files).toEqual(before);
});
it("adds and removes a prerequisite, changes branch and order, and adds a branch with exact diffs", () => {
  const store = setup(), owner = tree(store, "craft"), original = diskTree("craft");
  let raw = addParent(owner.raw as TreeRaw, "craft_rope", "craft_axe");
  raw = setNode(raw, "craft_hoe", { branch: "craft_materials", order: 9 });
  raw = addBranch(raw, { id: "craft_cooking", name: "cooking", order: 3 });
  store.edit(owner.path, raw);
  const expected = structuredClone(original);
  expected.nodes.find(n => n.target === "craft_rope")!.after.push("craft_axe");
  Object.assign(expected.nodes.find(n => n.target === "craft_hoe")!, { branch: "craft_materials", order: 9 });
  expected.branches.push({ id: "craft_cooking", name: "cooking", order: 3 });
  expect(draftTree(store, "craft")).toEqual(expected);
  expect([...store.drafts.keys()]).toEqual([owner.path]); expect(store.view.diagnostics).toEqual([]);
  raw = removeParent(removeParent(updateBranch(draftTree(store, "craft"), "craft_cooking", { name: "kitchen" }), "craft_rope", "craft_axe"), "craft_rope", "craft_axe");
  expect(raw.nodes.find(n => n.target === "craft_rope")!.after).toEqual(["craft_rock_knife"]);
  expect(raw.branches.at(-1)!.name).toBe("kitchen");
});
it("refuses cycles, self parents, duplicates and cross-tree parents with a message before staging", () => {
  const store = setup(), raw = tree(store, "craft").raw as TreeRaw;
  expect(() => addParent(raw, "craft_rock_knife", "craft_hoe")).toThrow("cycle craft_rock_knife → craft_axe → craft_hoe → craft_rock_knife");
  expect(cyclePath(raw, "craft_axe", "craft_axe")).toEqual(["craft_axe", "craft_axe"]);
  expect(() => addParent(raw, "craft_axe", "craft_axe")).toThrow("cycle");
  expect(() => addParent(raw, "craft_axe", "campfire")).toThrow("not in this tree");
  expect(() => addParent(raw, "craft_axe", "craft_rock_knife")).toThrow("already");
  expect(() => addParent(raw, "absent", "craft_axe")).toThrow("no node");
  expect(() => setNode(raw, "craft_axe", { branch: "nope" })).toThrow("Unknown branch");
  expect(() => setNode(raw, "craft_axe", { order: 1.5 })).toThrow("whole number");
  expect(store.drafts.size).toBe(0);
});
it("blocks deleting a branch in use and allows an unused one", () => {
  const store = setup(), raw = tree(store, "craft").raw as TreeRaw;
  expect(() => removeBranch(raw, "craft_tools")).toThrow("craft_rock_knife");
  const added = addBranch(raw, { id: "craft_spare", name: "spare", order: 9 });
  expect(removeBranch(added, "craft_spare")).toEqual(raw);
});
it("places an unplaced recipe with max order + 1 and the registry rejects the pack until then", () => {
  const store = setup(), owner = tree(store, "craft");
  store.edit("content/recipes/craft_pick.json", recipe("craft_pick"));
  const documents = store.view.documents;
  expect(store.view.diagnostics.map(d => d.message).join("\n")).toContain('craft target "craft_pick" needs exactly one node');
  expect(unplaced(documents, owner).map(d => d.id)).toEqual(["craft_pick"]);
  const raw = placeNode(tree(store, "craft").raw as TreeRaw, "craft_pick", "craft_tools", ["craft_axe"]);
  store.edit(owner.path, raw);
  expect(store.view.diagnostics).toEqual([]);
  expect(draftTree(store, "craft").nodes.at(-1)).toEqual({ target: "craft_pick", branch: "craft_tools", after: ["craft_axe"], order: nextOrder(diskTree("craft")) });
  expect(() => placeNode(raw, "craft_pick", "craft_tools", [])).toThrow("already has a node");
  expect(() => placeNode(raw, "craft_x", "craft_tools", ["campfire"])).toThrow("not in this tree");
});
it("New recipe here stages the entity and its node in one undo step and saves without diagnostics", () => {
  const store = setup();
  const path = store.createWithTreeNode("recipes", recipe("craft_pick"), { branch: "craft_tools", after: ["craft_axe"] });
  expect(path).toBe("content/recipes/craft_pick.json");
  expect([...store.drafts.keys()].sort()).toEqual(["content/recipes/craft_pick.json", "content/trees/crafting.json"]);
  const expected = diskTree("craft"); expected.nodes.push({ target: "craft_pick", branch: "craft_tools", after: ["craft_axe"], order: nextOrder(expected) });
  expect(draftTree(store, "craft")).toEqual(expected);
  expect(store.drafts.get(path)).toBe(formatContent(recipe("craft_pick")));
  expect(store.view.diagnostics).toEqual([]); expect(store.canSave).toBe(true);
  store.undo(); expect(store.drafts.size).toBe(0);
  expect(() => store.createWithTreeNode("recipes", recipe("craft_pick"), { branch: "craft_tools", after: ["campfire"] })).toThrow("not in this tree");
  expect(() => store.createWithTreeNode("recipes", recipe("craft_axe"), { branch: "craft_tools", after: [] })).toThrow("new IDs");
  expect(() => store.createWithTreeNode("items", recipe("x"), { branch: "craft_tools", after: [] })).toThrow("recipe or building");
  expect(store.drafts.size).toBe(0);
});
it("deleting a recipe or building removes its node in the same step, but never a prerequisite of another node", () => {
  const store = setup(), documents = store.view.documents;
  const hoe = documents.find(d => d.id === "craft_hoe")!, axe = documents.find(d => d.id === "craft_axe")!;
  expect(deletionBlockers(documents, hoe)).toEqual([]);
  const blockers = deletionBlockers(documents, axe);
  expect(blockers.map(b => blockerLabel(documents, b))).toEqual([expect.stringContaining("prerequisite of craft_hoe")]);
  expect(() => store.delete(axe.path)).toThrow("still referenced"); expect(store.drafts.size).toBe(0);
  store.delete(hoe.path);
  expect(store.drafts.get(hoe.path)).toBeNull();
  const expected = diskTree("craft"); expected.nodes = expected.nodes.filter(n => n.target !== "craft_hoe");
  expect(draftTree(store, "craft")).toEqual(expected);
  expect(store.view.diagnostics).toEqual([]);
  store.undo(); expect(store.drafts.size).toBe(0);
  expect(() => store.delete(documents.find(d => d.id === "bed")!.path)).toThrow("still referenced");
  expect(deletionBlockers(documents, documents.find(d => d.id === "shelter")!).map(b => b.path)).toContain("nodes.4.after.0");
});

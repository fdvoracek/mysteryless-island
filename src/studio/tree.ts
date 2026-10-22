import { Id } from "../content";
import type { Document } from "./documents";
import { deletionReferences, referenceLabel, type Reference } from "./references";
import { identityFields, schemaFor } from "./schema";
import type { Graph } from "./story";

export interface TreeNodeRaw { target: string; branch: string; after: string[]; order: number }
export interface TreeBranchRaw { id: string; name: string; order: number }
export interface TreeRaw { id: string; kind: "craft" | "build"; name: string; branches: TreeBranchRaw[]; nodes: TreeNodeRaw[] }
export const treeKinds = { craft: { label: "Crafting tree", entities: "recipes", noun: "recipe" }, build: { label: "Building tree", entities: "buildings", noun: "building" } } as const;

export function treeDocument(documents: Document[], kind: "craft" | "build"): Document | undefined {
  return documents.find(d => d.kind === "trees" && (d.raw as { kind?: string } | undefined)?.kind === kind);
}
/** Trees with a shape the editor can edit safely; a damaged one is repaired in the JSON view. */
export function isTreeShape(raw: unknown): raw is TreeRaw {
  const tree = raw as TreeRaw | undefined;
  return !!tree && Array.isArray(tree.branches) && Array.isArray(tree.nodes) && tree.nodes.every(n => n && typeof n.target === "string" && Array.isArray(n.after)) && tree.branches.every(b => b && typeof b.id === "string");
}
const label = (documents: Document[], tree: TreeRaw, id: string) => referenceLabel(tree.kind === "craft" ? "recipe" : "building", id, documents);
export function treeGraph(owner: Document, documents: Document[]): Graph {
  const tree = owner.raw as TreeRaw, kind = treeKinds[tree.kind].noun;
  return {
    nodes: tree.nodes.map(n => ({ id: n.target, kind, label: label(documents, tree, n.target), note: `${n.branch} · order ${n.order}` })),
    edges: tree.nodes.flatMap((n, i) => n.after.map((parent, j) => ({ id: `${parent}/${n.target}`, source: parent, target: n.target, label: "prerequisite of", file: owner.path, path: `nodes.${i}.after.${j}` }))),
  };
}
const find = (tree: TreeRaw, target: string) => {
  const node = tree.nodes.find(n => n.target === target);
  if (!node) throw new Error(`${target} has no node in this tree.`);
  return node;
};
const patchNode = (tree: TreeRaw, target: string, patch: (node: TreeNodeRaw) => TreeNodeRaw): TreeRaw => ({ ...tree, nodes: tree.nodes.map(n => n.target === target ? patch(n) : n) });
/** Prerequisite chain child → … → parent that a new parent → child edge would close into a loop. */
export function cyclePath(tree: TreeRaw, child: string, parent: string): string[] | undefined {
  if (child === parent) return [child, child];
  const next = new Map<string, string[]>();
  for (const n of tree.nodes) for (const p of n.after) next.set(p, [...next.get(p) ?? [], n.target]);
  const walk = (id: string, path: string[]): string[] | undefined => {
    if (id === parent) return path;
    for (const to of next.get(id) ?? []) { if (path.includes(to)) continue; const found = walk(to, [...path, to]); if (found) return found; }
    return undefined;
  };
  const path = walk(child, [child]);
  return path && [...path, child];
}
export function addParent(tree: TreeRaw, child: string, parent: string): TreeRaw {
  const node = find(tree, child);
  if (!tree.nodes.some(n => n.target === parent)) throw new Error(`${parent} is not in this tree; prerequisites must come from the same tree.`);
  if (node.after.includes(parent)) throw new Error(`${parent} is already a prerequisite of ${child}.`);
  const cycle = cyclePath(tree, child, parent);
  if (cycle) throw new Error(`Refused: this would create a cycle ${cycle.join(" → ")}.`);
  return patchNode(tree, child, n => ({ ...n, after: [...n.after, parent] }));
}
export function removeParent(tree: TreeRaw, child: string, parent: string): TreeRaw {
  find(tree, child);
  return patchNode(tree, child, n => ({ ...n, after: n.after.filter(p => p !== parent) }));
}
export function setNode(tree: TreeRaw, target: string, patch: Partial<Pick<TreeNodeRaw, "branch" | "order">>): TreeRaw {
  const node = find(tree, target);
  if (patch.branch !== undefined && !tree.branches.some(b => b.id === patch.branch)) throw new Error(`Unknown branch ${patch.branch}.`);
  if (patch.order !== undefined && !Number.isInteger(patch.order)) throw new Error("Order must be a whole number.");
  return patchNode(tree, node.target, n => ({ ...n, ...patch }));
}
export const nextOrder = (tree: TreeRaw) => Math.max(-1, ...tree.nodes.map(n => n.order)) + 1;
/** Adds the single node of a target; parents must exist in the tree. */
export function placeNode(tree: TreeRaw, target: string, branch: string, after: string[]): TreeRaw {
  if (tree.nodes.some(n => n.target === target)) throw new Error(`${target} already has a node.`);
  if (!tree.branches.some(b => b.id === branch)) throw new Error(`Unknown branch ${branch}.`);
  for (const parent of after) if (!tree.nodes.some(n => n.target === parent)) throw new Error(`${parent} is not in this tree; prerequisites must come from the same tree.`);
  if (new Set(after).size !== after.length) throw new Error("Duplicate prerequisites.");
  return { ...tree, nodes: [...tree.nodes, { target, branch, after, order: nextOrder(tree) }] };
}
export function unplaced(documents: Document[], owner: Document): Document[] {
  const tree = owner.raw as TreeRaw, placed = new Set(tree.nodes.map(n => n.target));
  return documents.filter(d => d.kind === treeKinds[tree.kind].entities && !placed.has(d.id));
}
export function branchUsers(tree: TreeRaw, branch: string): string[] { return tree.nodes.filter(n => n.branch === branch).map(n => n.target); }
export function branchIdProblem(documents: Document[], id: string): string | undefined {
  if (!Id.safeParse(id).success) return "Use a new, unique lowercase snake_case ID.";
  const taken = documents.some(d => { const schema = schemaFor(d.path); return schema && identityFields(schema, d.raw).some(f => f.value === id); });
  return taken ? "Use a new, unique lowercase snake_case ID." : undefined;
}
export function addBranch(tree: TreeRaw, branch: TreeBranchRaw): TreeRaw { return { ...tree, branches: [...tree.branches, branch] }; }
export function updateBranch(tree: TreeRaw, id: string, patch: Partial<Pick<TreeBranchRaw, "name" | "order">>): TreeRaw {
  if (patch.order !== undefined && !Number.isInteger(patch.order)) throw new Error("Order must be a whole number.");
  return { ...tree, branches: tree.branches.map(b => b.id === id ? { ...b, ...patch } : b) };
}
export function removeBranch(tree: TreeRaw, id: string): TreeRaw {
  const users = branchUsers(tree, id);
  if (users.length) throw new Error(`Branch ${id} is used by ${users.join(", ")}.`);
  if (tree.branches.length === 1) throw new Error("A tree needs at least one branch.");
  return { ...tree, branches: tree.branches.filter(b => b.id !== id) };
}
/** The one node of a recipe/building; its own `target` reference never blocks deleting it. */
function ownNode(documents: Document[], target: Document): { tree: Document; index: number } | undefined {
  const kind = target.kind === "recipes" ? "craft" : target.kind === "buildings" ? "build" : undefined;
  const tree = kind && treeDocument(documents, kind);
  if (!tree || !isTreeShape(tree.raw)) return undefined;
  const index = tree.raw.nodes.findIndex(n => n.target === target.id);
  return index < 0 ? undefined : { tree, index };
}
/** References that really block deleting `target`: everything except its own tree node. */
export function deletionBlockers(documents: Document[], target: Document): Reference[] {
  const own = ownNode(documents, target);
  return deletionReferences(documents, target).filter(ref => !(own && ref.file === own.tree.path && ref.path === `nodes.${own.index}.target`));
}
/** Readable name of the dependent child node behind a blocking prerequisite reference. */
export function blockerLabel(documents: Document[], ref: Reference): string {
  const match = /^nodes\.(\d+)\.after\.\d+$/.exec(ref.path);
  const tree = documents.find(d => d.path === ref.file)?.raw;
  return match && isTreeShape(tree) ? `${ref.file} › ${ref.path} (prerequisite of ${tree.nodes[Number(match[1])]?.target})` : `${ref.file} › ${ref.path}`;
}
/** The tree file contents without the node of `target`, or undefined when it has none. */
export function withoutNode(documents: Document[], target: Document): { path: string; raw: TreeRaw } | undefined {
  const own = ownNode(documents, target);
  if (!own) return undefined;
  const tree = own.tree.raw as TreeRaw;
  return { path: own.tree.path, raw: { ...tree, nodes: tree.nodes.filter((_, i) => i !== own.index) } };
}

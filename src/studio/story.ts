import type { Document } from "./documents";
import { GAME_FLAGS } from "./game-flags";
import { getAt, identities, references, resolvesTo, type Identity, type Reference } from "./references";

export interface GraphNode { id: string; label: string; kind: string; file?: string; path?: string; areas?: string[]; note?: string }
/** `driving` is set only by the story view; other graphs leave it unset and always show their edges. */
export interface GraphEdge { id: string; source: string; target: string; label: string; file: string; path: string; driving?: boolean }
export interface Graph { nodes: GraphNode[]; edges: GraphEdge[] }
export interface Story extends Graph { warnings: { file: string; path: string; message: string }[] }
const nodeId = (identity: Identity) => `${identity.kind}:${identity.id}`;
const cache = new WeakMap<Document[], Story>();
/** Reference positions supply meaning; reference metadata supplies all targets. */
export function referenceRole(ref: Reference): { label: string; effect: boolean } {
  const parts = ref.path.split(".");
  const leaf = parts.at(-1);
  if (parts.includes("effects") && parts.lastIndexOf("when") < parts.lastIndexOf("effects") && parts.lastIndexOf("visibleWhen") < parts.lastIndexOf("effects") && parts.lastIndexOf("requires") < parts.lastIndexOf("effects")) return { label: `effect: ${{ startQuest: "starts", unlock: "unlocks", flag: "sets flag", unflag: "clears flag" }[leaf ?? ""] ?? leaf}`, effect: true };
  return { label: parts.includes("completeWhen") ? "completes" : parts.includes("unlockWhen") ? "unlocks" : parts.includes("trigger") ? "trigger" : "when", effect: false };
}
/**
 * Story-driving positions, classified from the reference position label (never from field names):
 * a trigger, completion or unlock condition, an effect that starts a task, unlocks something or
 * sets a flag, and flag setters and readers. Other conditions (such as `when` on text lines) and
 * clearing a flag are plain references.
 */
const DRIVING = new Set(["trigger", "completes", "unlocks", "effect: starts", "effect: unlocks", "effect: sets flag"]);
export const isDriving = (label: string, flag: boolean) => DRIVING.has(label) || (flag && label !== "effect: clears flag");
export function deriveStory(documents: Document[]): Story {
  const cached = cache.get(documents); if (cached) return cached;
  const refs = references(documents), definitions = identities(documents);
  const allowed = new Set(["discovery", "quest", "region"]);
  const nodes: GraphNode[] = definitions.filter(d => allowed.has(d.kind)).map(d => {
    const owner = documents.find(doc => doc.path === d.file)!;
    const parentPath = d.kind === "discovery" ? d.path.slice(0, -3) : "";
    const raw = getAt(owner.raw, parentPath) as { label?: string } | undefined;
    return { id: nodeId(d), kind: d.kind, label: `${d.id} · ${d.kind === "discovery" ? raw?.label ?? d.id : owner.label}`, file: d.file, path: parentPath, areas: d.kind === "region" || d.kind === "discovery" ? [owner.id] : [] };
  });
  for (const doc of documents.filter(d => d.kind === "events")) nodes.push({ id: `event:${doc.id}`, kind: "event", label: `${doc.id} · ${doc.label}`, file: doc.path, path: "", areas: [] });
  const flags = [...new Set(refs.filter(r => r.kind === "flag").map(r => r.id))];
  for (const id of flags) nodes.push({ id: `flag:${id}`, kind: "flag", label: id, note: GAME_FLAGS.some(f => f.id === id) ? "set by the game" : undefined, areas: [] });
  const byId = new Map(nodes.map(node => [node.id, node]));
  const owners = new Map(documents.map(doc => [doc.path, nodes.find(n => n.file === doc.path && n.kind !== "discovery")]));
  const edges: GraphEdge[] = [];
  for (const ref of refs) {
    const owner = nodes.find(n => n.kind === "discovery" && n.file === ref.file && ref.path.startsWith(n.path! + ".")) ?? owners.get(ref.file);
    if (!owner) continue;
    const targets = ref.kind === "flag" ? [{ kind: "flag", id: ref.id, file: "", path: "" }] : definitions.filter(d => allowed.has(d.kind) && resolvesTo(ref, d, documents));
    for (const target of targets) {
      const referenced = byId.get(nodeId(target)); if (!referenced) continue;
      const role = referenceRole(ref);
      // Flags are bridges from authored setters to readers. Other edges follow
      // the reference contract: referenced identity -> referencing entity.
      const source = ref.kind === "flag" && role.effect ? owner.id : referenced.id;
      const destination = ref.kind === "flag" && role.effect ? referenced.id : owner.id;
      edges.push({ id: `${ref.file}:${ref.path}:${source}`, source, target: destination, label: role.label, file: ref.file, path: ref.path, driving: isDriving(role.label, ref.kind === "flag") });
    }
  }
  // Area membership follows story connections in either direction. This includes
  // task/event chains without adding fictitious semantic graph edges.
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) for (const [a, b] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      const source = byId.get(a)!, target = byId.get(b)!;
      if (target.kind === "region" || target.kind === "discovery") continue;
      for (const area of source.areas ?? []) if (!target.areas!.includes(area)) { target.areas!.push(area); changed = true; }
    }
  }
  const warnings = refs.filter(r => r.kind === "flag" && !referenceRole(r).effect && !GAME_FLAGS.some(f => f.id === r.id)
    && !refs.some(setter => setter.kind === "flag" && setter.id === r.id && referenceRole(setter).label === "effect: sets flag"))
    .map(r => ({ file: r.file, path: r.path, message: `Flag ${r.id} is never set by content or the game; probably a typo.` }));
  const result = { nodes, edges, warnings }; cache.set(documents, result); return result;
}
export function filterStory(graph: Graph, area: string, kinds: string[]): Graph {
  const nodes = graph.nodes.filter(n => (!area || n.areas?.includes(area)) && kinds.includes(n.kind));
  const visible = new Set(nodes.map(n => n.id));
  return { nodes, edges: graph.edges.filter(e => visible.has(e.source) && visible.has(e.target)) };
}
/** Default view: story-driving references only. Edges without a classification always stay. */
export function filterEdges(graph: Graph, all: boolean): Graph {
  return all ? graph : { nodes: graph.nodes, edges: graph.edges.filter(e => e.driving !== false) };
}
export function continuation(node: GraphNode, kind: string): Record<string, unknown> {
  if (!["discovery", "quest"].includes(node.kind)) throw new Error("Choose a landmark or task.");
  const id = node.id.slice(node.id.indexOf(":") + 1);
  const condition = node.kind === "discovery" ? { discovered: id } : { quest: id, is: "done" };
  if (kind === "quests") return { trigger: { when: condition } };
  if (kind === "events") return { trigger: { when: condition } };
  if (kind === "regions") return { unlockWhen: condition };
  throw new Error("Choose a task, event or area.");
}

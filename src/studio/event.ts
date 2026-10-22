import { EventChoice, EventScene, Id, type ContentProblem } from "../content";
import type { Document } from "./documents";
import { whereUsed } from "./references";
import { stripComments } from "./schema";
import type { Graph } from "./story";
export interface Choice { id: string; label: string; next?: string; [key: string]: unknown }
export interface Scene { text: unknown; choices?: Choice[]; [key: string]: unknown }
export interface EventRaw { scenes: Record<string, Scene>; [key: string]: unknown }
export function eventGraph(owner: Document): Graph {
  const scenes = (owner.raw as EventRaw)?.scenes ?? {};
  const graph: Graph = { nodes: Object.entries(scenes).filter(([key]) => !key.startsWith("_")).map(([id, scene]) => ({ id, kind: "scene", label: id, note: id === "start" ? "start scene" : !scene.choices?.length ? "ends event (close)" : undefined, file: owner.path, path: `scenes.${id}` })),
    edges: Object.entries(scenes).filter(([key]) => !key.startsWith("_")).flatMap(([id, scene]) => (Array.isArray(scene.choices) ? scene.choices : []).map((choice, index) => ({ id: `${id}:${index}`, source: id, target: choice.next ?? "(close)", label: `${choice.id} · ${choice.label}${choice.next ? "" : " · ends event"}`, file: owner.path, path: `scenes.${id}.choices.${index}` }))) };
  const existing = new Set(graph.nodes.filter(n => n.kind === "scene").map(n => n.id));
  for (const edge of graph.edges) if (!existing.has(edge.target)) {
    graph.nodes.push({ id: edge.target, kind: edge.target === "(close)" ? "end" : "missing", label: edge.target === "(close)" ? "event ends" : `missing scene: ${edge.target}` });
    existing.add(edge.target);
  }
  return graph;
}
export function eventChecks(owner: Document, problems: ContentProblem[]): ContentProblem[] {
  const graph = eventGraph(owner), scenes = new Set(graph.nodes.filter(n => n.kind === "scene").map(n => n.id));
  const checks = problems.filter(p => p.file === owner.path && (p.path === "scenes.start" || p.path.endsWith(".next")));
  const add = (path: string, message: string) => { if (!checks.some(c => c.path === path)) checks.push({ file: owner.path, path, message }); };
  if (!scenes.has("start")) add("scenes.start", 'Missing start scene.');
  for (const edge of graph.edges) if (edge.target !== "(close)" && !scenes.has(edge.target)) add(edge.path + ".next", `Dangling next: ${edge.target}.`);
  const reachable = new Set(scenes.has("start") ? ["start"] : []);
  let changed = true;
  while (changed) { changed = false; for (const edge of graph.edges) if (reachable.has(edge.source) && scenes.has(edge.target) && !reachable.has(edge.target)) { reachable.add(edge.target); changed = true; } }
  for (const node of graph.nodes) if (node.kind === "scene" && !reachable.has(node.id)) add(`scenes.${node.id}`, `Unreachable scene: ${node.id}. Studio warning; does not block saving.`);
  return checks;
}
function blankAuthorString(value: unknown): boolean {
  if (typeof value === "string") return !value.trim();
  return !!value && typeof value === "object" && Object.entries(value).some(([key, child]) => !key.startsWith("_") && blankAuthorString(child));
}
export function addScene(raw: EventRaw, id: string, scene: unknown): EventRaw {
  if (!Id.safeParse(id).success || id in raw.scenes || id.startsWith("_")) throw new Error("Use a new lowercase snake_case scene ID.");
  if (!EventScene.safeParse(stripComments(scene)).success || blankAuthorString(scene)) throw new Error("Complete the scene fields.");
  return { ...raw, scenes: { ...raw.scenes, [id]: scene as Scene } };
}
export function addChoice(raw: EventRaw, scene: string, choice: unknown): EventRaw {
  if (!raw.scenes[scene]) throw new Error("Choose an existing source scene.");
  const parsed = EventChoice.safeParse(stripComments(choice));
  if (!parsed.success || blankAuthorString(choice)) throw new Error("Complete the choice fields.");
  if (parsed.data.next && !raw.scenes[parsed.data.next]) throw new Error("Choose an existing next scene or create it first.");
  if (Object.values(raw.scenes).some(s => s.choices?.some(c => c.id === parsed.data.id))) throw new Error("Use a new choice ID.");
  return { ...raw, scenes: { ...raw.scenes, [scene]: { ...raw.scenes[scene], choices: [...(raw.scenes[scene].choices ?? []), choice as Choice] } } };
}
export function removeChoice(raw: EventRaw, scene: string, index: number): EventRaw {
  const current = raw.scenes[scene];
  if (!current?.choices || !current.choices[index]) throw new Error("Choose an existing choice.");
  const next = { ...current, choices: current.choices.filter((_, i) => i !== index) };
  // An omitted choices field means a close scene; an empty array is schema-invalid.
  if (!next.choices.length) delete (next as Scene).choices;
  return { ...raw, scenes: { ...raw.scenes, [scene]: next } };
}
export function deleteScene(documents: Document[], owner: Document, id: string, retarget?: string): EventRaw {
  const raw = owner.raw as EventRaw;
  if (id === "start") throw new Error("The start scene is reserved.");
  if (!raw.scenes[id]) throw new Error("Choose an existing scene.");
  const incoming = whereUsed(documents, owner, `scenes.${id}`).filter(ref => !ref.path.startsWith(`scenes.${id}.`));
  if (incoming.length && (!retarget || retarget === id || !raw.scenes[retarget])) throw new Error("Retarget incoming choices before deleting this scene.");
  const scenes = { ...raw.scenes }; delete scenes[id];
  for (const ref of incoming) {
    // Positions come from the shared contextual scene reference resolver.
    const [, scene, , index] = ref.path.split(".");
    const choices = scenes[scene].choices!;
    scenes[scene] = { ...scenes[scene], choices: choices.map((choice, i) => i === Number(index) ? { ...choice, next: retarget } : choice) };
  }
  return { ...raw, scenes };
}

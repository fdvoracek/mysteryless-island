import { GAME_FLAGS } from "./game-flags";
import { reservedReason } from "./reserved";
import type { Document } from "./documents";
import { identityFields, refKind, schemaFor, visitValue } from "./schema";
export interface Reference { file: string; path: string; kind: string; id: string; key?: boolean }
export function getAt(raw: unknown, path: string): unknown {
  return path ? path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, raw) : raw;
}
export function referenceOptions(kind: string, documents: Document[], owner: Document, path = ""): string[] {
  const raw = owner.raw as Record<string, unknown> | undefined;
  const listIds = (value: unknown, key = "id"): string[] => Array.isArray(value)
    ? value.flatMap((entry) => entry && typeof entry === "object" && typeof entry[key] === "string" ? [entry[key] as string] : []) : [];
  const ids = (entityKind: string) => documents.filter((d) => d.kind === entityKind).map((d) => d.id);
  const game = documents.find((d) => d.path === "content/game.json")?.raw as Record<string, unknown> | undefined;
  const stats = documents.find((d) => d.path === "content/stats.json")?.raw as { stats?: { id: string }[] } | undefined;
  const climate = documents.find((d) => d.path === "content/climate.json")?.raw as { phases?: { id: string }[]; bodyBands?: { id: string }[] } | undefined;
  const nested = (entityKind: string, part: string) => documents.filter((d) => d.kind === entityKind).flatMap((d) => {
    const schema = schemaFor(d.path);
    return schema ? identityFields(schema, d.raw).filter((field) => field.path.includes(part)).map((field) => field.value) : [];
  });
  const actionIds = () => [...ids("activities"), ...ids("items"), ...ids("quests"), ...ids("buildings"), ...ids("recipes"), ...ids("regions"), ...nested("regions", "landmarks."), ...nested("buildings", "cycle.")];
  let values: string[];
  switch (kind) {
    case "flag": values = [...references(documents).filter(ref => ref.kind === "flag").map(ref => ref.id), ...GAME_FLAGS.map(flag => flag.id)]; break;
    case "scene": values = Object.keys((raw?.scenes ?? {}) as object); break;
    case "production": {
      const effect = getAt(raw, path.split(".").slice(0, -1).join(".")) as { startCycle?: string } | undefined;
      const building = documents.find((d) => d.kind === "buildings" && d.id === effect?.startCycle)?.raw as { cycle?: { products?: object } } | undefined;
      values = Object.keys(building?.cycle?.products ?? {}); break;
    }
    case "treeTarget": values = ids(raw?.kind === "craft" ? "recipes" : "buildings"); break;
    case "treeParent": values = listIds(raw?.nodes, "target"); break;
    case "treeBranch": values = listIds(raw?.branches); break;
    case "timer": values = listIds(game?.timers); break;
    case "stat": values = listIds(stats?.stats); break;
    case "band": values = listIds(climate?.bodyBands); break;
    case "phase": values = listIds(climate?.phases); break;
    case "tool": values = Object.keys((game?.tools ?? {}) as object); break;
    case "discovery": values = nested("regions", "landmarks."); break;
    case "did": case "today": case "action": {
      const tags: string[] = [];
      for (const d of documents) {
        const findTags = (value: unknown): void => {
          if (!value || typeof value !== "object") return;
          for (const [key, child] of Object.entries(value)) {
            if (key.startsWith("_")) continue;
            if (key === "tags" && Array.isArray(child)) tags.push(...child.filter((v): v is string => typeof v === "string"));
            else findTags(child);
          }
        };
        findTags(d.raw);
      }
      values = [...actionIds(), ...tags, ...(kind === "action" ? ["explore", "travel"] : [])]; break;
    }
    default: values = ids(({ item: "items", activity: "activities", region: "regions", quest: "quests", building: "buildings", recipe: "recipes", site: "sites", artwork: "artwork" } as Record<string, string>)[kind] ?? kind);
  }
  return [...new Set(values)].sort();
}
const referenceIndexes = new WeakMap<Document[], Reference[]>();
export function references(documents: Document[]): Reference[] {
  const cached = referenceIndexes.get(documents);
  if (cached) return cached;
  const result: Reference[] = [];
  for (const document of documents) {
    const schema = schemaFor(document.path);
    if (!schema) continue;
    visitValue(schema, document.raw, ({ schema, value, path, key }) => {
      const kind = refKind(schema);
      if (kind && typeof value === "string") result.push({ file: document.path, path, kind, id: value, ...(key ? { key: true } : {}) });
    });
  }
  referenceIndexes.set(documents, result);
  return result;
}
export interface Identity { file: string; path: string; id: string; kind: string; key?: boolean; reserved?: string }
const direct: Record<string, string> = { items: "item", activities: "activity", regions: "region", quests: "quest", buildings: "building", recipes: "recipe", sites: "site", artwork: "artwork" };
/** Definitions, distinct from reference positions. Record-key identities retain their owner. */
const identityIndexes = new WeakMap<Document[], Identity[]>();
export function identities(documents: Document[]): Identity[] {
  const cached = identityIndexes.get(documents);
  if (cached) return cached;
  const result = documents.flatMap(document => {
    const schema = schemaFor(document.path);
    if (!schema) return [];
    const result: Identity[] = [];
    visitValue(schema, document.raw, ({ value, path, key }) => {
      if (typeof value !== "string") return;
      let kind: string | undefined;
      if (!key && path.split(".").at(-1) === "id") {
        kind = path === "id" ? direct[document.kind] ?? "tree" :
          /^explore\.landmarks\.\d+\.id$/.test(path) ? "discovery" :
          /^cycle\.(start|collect)\.id$/.test(path) ? "step" :
          /^actions\.\d+\.id$/.test(path) ? "itemAction" :
          /^timers\.\d+\.id$/.test(path) ? "timer" :
          /^stats\.\d+\.id$/.test(path) ? "stat" :
          /^bodyBands\.\d+\.id$/.test(path) ? "band" :
          /^phases\.\d+\.id$/.test(path) ? "phase" :
          document.kind === "trees" && /^branches\.\d+\.id$/.test(path) ? "treeBranch" :
          /\.choices\.\d+\.id$/.test(path) ? "choice" : "text";
      } else if (key) {
        if (document.kind === "events" && /^scenes\.[^.]+$/.test(path)) kind = "scene";
        if (document.kind === "buildings" && /^cycle\.products\.[^.]+$/.test(path)) kind = "production";
        if (document.path === "content/game.json" && /^tools\.[^.]+$/.test(path)) kind = "tool";
      }
      if (kind) result.push({ file: document.path, path, id: value, kind, ...(key ? { key: true } : {}), ...(reservedReason(kind, value) ? { reserved: reservedReason(kind, value) } : {}) });
    });
    return result;
  });
  identityIndexes.set(documents, result);
  return result;
}
export function resolvesTo(reference: Reference, target: Identity, documents: Document[]): boolean {
  if (reference.id !== target.id) return false;
  const owner = documents.find(d => d.path === reference.file);
  if (!owner) return false;
  if (reference.kind === "scene") return target.kind === "scene" && target.file === reference.file;
  if (reference.kind === "production") {
    const effect = getAt(owner.raw, reference.path.split(".").slice(0, -1).join(".")) as { startCycle?: string } | undefined;
    return target.kind === "production" && documents.some(d => d.path === target.file && d.kind === "buildings" && d.id === effect?.startCycle);
  }
  if (reference.kind === "treeBranch") return target.kind === "treeBranch" && target.file === reference.file;
  if (["treeTarget", "treeParent"].includes(reference.kind)) return target.kind === ((owner.raw as { kind?: string })?.kind === "craft" ? "recipe" : "building");
  if (["did", "today", "action"].includes(reference.kind)) return ["activity", "item", "step", "building", "recipe", ...(reference.kind === "did" ? [] : ["discovery", "quest"]), ...(reference.kind === "today" ? ["region"] : [])].includes(target.kind);
  return reference.kind === target.kind;
}
/** A precise definition, including references inside its own file. No area-wide discovery alias. */
export function whereUsed(documents: Document[], target: Document, path = "id"): Reference[] {
  const definition = identities(documents).find(id => id.file === target.path && id.path === path);
  return definition ? references(documents).filter(ref => resolvesTo(ref, definition, documents)) : [];
}
/** References outside a subtree being removed; internal references disappear with that subtree. */
export function deletionReferences(documents: Document[], target: Document, subtree = ""): Reference[] {
  const inside = (path: string) => !subtree || path === subtree || path.startsWith(subtree + ".");
  const owned = identities(documents).filter(id => id.file === target.path && inside(id.path));
  return references(documents).filter(ref => !(ref.file === target.path && inside(ref.path)) && owned.some(id => resolvesTo(ref, id, documents)));
}

/** Picker and summary labels share one resolver; unresolved IDs remain editable. */
const labelIndexes = new WeakMap<Document[], Map<string, string>>();
export function referenceLabel(kind: string, id: string, documents: Document[]): string {
  let index = labelIndexes.get(documents);
  if (!index) {
    index = new Map();
    const direct: Record<string, string> = { items: "item", activities: "activity", regions: "region", quests: "quest", buildings: "building", recipes: "recipe", sites: "site", artwork: "artwork" };
    const add = (kind: string, id: unknown, label: unknown) => {
      if (typeof id === "string" && typeof label === "string" && id !== label) index!.set(`${kind}:${id}`, `${id} — ${label}`);
    };
    for (const document of documents) {
      add(direct[document.kind], document.id, document.label);
      const schema = schemaFor(document.path);
      if (schema) for (const field of identityFields(schema, document.raw)) {
        const parent = getAt(document.raw, field.path.split(".").slice(0, -1).join(".")) as Record<string, unknown> | undefined;
        const label = parent?.label ?? parent?.name ?? parent?.title;
        if (document.kind === "regions" && field.path.includes("landmarks.")) add("discovery", field.value, label);
        for (const kind of ["did", "today", "action"]) add(kind, field.value, label);
      }
      const raw = document.raw as Record<string, unknown> | undefined;
      for (const [kind, collection] of Object.entries({ timer: "timers", stat: "stats", phase: "phases", band: "bodyBands" })) {
        const entries = raw?.[collection];
        if (Array.isArray(entries)) for (const entry of entries) if (entry && typeof entry === "object") add(kind, entry.id, entry.name ?? entry.label);
      }
      if (document.path === "content/game.json" && raw?.tools && typeof raw.tools === "object") for (const [id, tool] of Object.entries(raw.tools)) add("tool", id, (tool as { label?: string })?.label);
    }
    labelIndexes.set(documents, index);
  }
  return index.get(`${kind}:${id}`) ?? id;
}

/** Same resolver as identity Used by, including virtual (non-renamable) flags. */
export function flagUsedBy(documents: Document[], id: string): Reference[] {
  return references(documents).filter(ref => resolvesTo(ref, { kind: "flag", id, file: "", path: "" }, documents));
}

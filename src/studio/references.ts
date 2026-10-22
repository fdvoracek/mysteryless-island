import type { Document } from "./documents";
import { identityFields, refKind, schemaFor, visitValue } from "./schema";
export interface Reference { file: string; path: string; kind: string; id: string }
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
export function references(documents: Document[]): Reference[] {
  const result: Reference[] = [];
  for (const document of documents) {
    const schema = schemaFor(document.path);
    if (!schema) continue;
    visitValue(schema, document.raw, ({ schema, value, path }) => {
      const kind = refKind(schema);
      if (kind && typeof value === "string") result.push({ file: document.path, path, kind, id: value });
    });
  }
  return result;
}
export function whereUsed(documents: Document[], target: Document): Reference[] {
  const schema = schemaFor(target.path);
  const owned = new Set(schema ? identityFields(schema, target.raw).map((field) => field.value) : [target.id]);
  return references(documents).filter((reference) => {
    if (reference.file === target.path || !owned.has(reference.id)) return false;
    const direct: Record<string, string> = { item: "items", activity: "activities", region: "regions", quest: "quests", building: "buildings", recipe: "recipes", site: "sites", artwork: "artwork" };
    if (direct[reference.kind]) return target.kind === direct[reference.kind] && reference.id === target.id;
    if (reference.kind === "discovery") return target.kind === "regions";
    if (["treeTarget", "treeParent"].includes(reference.kind)) {
      const owner = documents.find((document) => document.path === reference.file);
      return target.kind === ((owner?.raw as { kind?: string })?.kind === "craft" ? "recipes" : "buildings");
    }
    if (["did", "today", "action"].includes(reference.kind)) return ["activities", "items", "buildings", "recipes", ...(reference.kind === "did" ? [] : ["regions", "quests"])].includes(target.kind);
    // Scenes, product names and branches are local to their document; other definitions are
    // singleton settings. A coincidentally equal entity ID must not count as their owner.
    return false;
  });
}

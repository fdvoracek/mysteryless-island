import { z } from "zod";
import { Activity, Artwork, Building, Climate, CreationTree, Game, GameEvent, Item, Quest, Recipe, Region, Site, StatsFile } from "../content";

export type Schema = z.ZodTypeAny;
export const entitySchemas: Record<string, Schema> = {
  regions: Region, activities: Activity, items: Item, recipes: Recipe, buildings: Building,
  quests: Quest, events: GameEvent, sites: Site, artwork: Artwork,
};
export function schemaFor(path: string): Schema | undefined {
  const parts = path.split("/");
  return parts[1] === "trees" ? CreationTree : parts.length === 2
    ? ({ "game.json": Game, "stats.json": StatsFile, "climate.json": Climate } as Record<string, Schema>)[parts[1]]
    : entitySchemas[parts[1]];
}
const resolvedNodes = new WeakMap<Schema, Schema>();
export function unwrap(schema: Schema): Schema {
  const original = schema;
  const cached = resolvedNodes.get(schema);
  if (cached) return cached;
  const seen = new Set<Schema>();
  while (!seen.has(schema)) {
    seen.add(schema);
    if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable || schema instanceof z.ZodDefault) schema = schema._def.innerType;
    else if (schema instanceof z.ZodEffects) schema = schema._def.schema;
    else if (schema instanceof z.ZodLazy) schema = schema.schema;
    else break;
  }
  resolvedNodes.set(original, schema);
  return schema;
}
export function stripComments(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripComments);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith("_")).map(([key, child]) => [key, stripComments(child)]));
  return value;
}
export function branches(schema: Schema): Schema[] {
  const node = unwrap(schema);
  return node instanceof z.ZodUnion || node instanceof z.ZodDiscriminatedUnion ? [...node.options] : [];
}
export function branchFor(schema: Schema, value: unknown): number {
  const options = branches(schema);
  const valid = options.findIndex((option) => option.safeParse(stripComments(value)).success);
  if (valid >= 0) return valid;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value).filter((key) => !key.startsWith("_"));
    const matching = options.findIndex((option) => {
      const node = unwrap(option);
      return node instanceof z.ZodObject && keys.length > 0 && keys.every((key) => key in node.shape);
    });
    if (matching >= 0) return matching;
  }
  return 0;
}
export function branchLabel(schema: Schema, index: number): string {
  const node = unwrap(schema);
  if (node instanceof z.ZodObject) return Object.entries(node.shape).filter(([, child]) => !(child as Schema).isOptional()).map(([key, child]) => {
    const value = unwrap(child as Schema);
    return value instanceof z.ZodLiteral ? `${key}: ${value.value}` : key;
  }).join(" + ") || `object ${index + 1}`;
  return node._def.typeName.replace("Zod", "").toLowerCase();
}
/** Empty structures only; author text and numeric values are never fabricated. */
export function initialValue(schema: Schema, seen = new Set<Schema>()): unknown {
  if (seen.has(schema)) return null;
  seen = new Set(seen).add(schema);
  const node = unwrap(schema);
  if (node instanceof z.ZodObject) return Object.fromEntries(Object.entries(node.shape).filter(([, child]) => !(child as Schema).isOptional()).map(([key, child]) => [key, initialValue(child as Schema, seen)]));
  if (node instanceof z.ZodArray) return [];
  if (node instanceof z.ZodRecord) return {};
  if (node instanceof z.ZodString) return "";
  if (node instanceof z.ZodBoolean) return false;
  if (node instanceof z.ZodLiteral) return node.value;
  if (node instanceof z.ZodEnum) return "";
  if (branches(node).length) return initialValue(branches(node)[0], seen);
  return null;
}
export const refKind = (schema: Schema): string | undefined => (schema.description ?? unwrap(schema).description)?.match(/^ref:(.+)$/)?.[1];
export interface Visit { schema: Schema; value: unknown; path: string; key?: boolean }
/** Walk the actual raw branch, never materializing optional fields or losing comments. */
export function visitValue(schema: Schema, value: unknown, visit: (entry: Visit) => void, path = "", depth = 0): void {
  if (depth > 100) return;
  visit({ schema, value, path });
  const node = unwrap(schema);
  const options = branches(node);
  if (options.length) { visitValue(options[branchFor(node, value)], value, visit, path, depth + 1); return; }
  if (node instanceof z.ZodObject && value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) if (!key.startsWith("_") && node.shape[key]) visitValue(node.shape[key], child, visit, [path, key].filter(Boolean).join("."), depth + 1);
  } else if (node instanceof z.ZodArray && Array.isArray(value)) value.forEach((child, index) => visitValue(node.element, child, visit, [path, index].filter((v) => v !== "").join("."), depth + 1));
  else if (node instanceof z.ZodRecord && value && typeof value === "object" && !Array.isArray(value)) for (const [key, child] of Object.entries(value)) {
    if (key.startsWith("_")) continue;
    const childPath = [path, key].filter(Boolean).join(".");
    visit({ schema: node.keySchema, value: key, path: childPath, key: true });
    visitValue(node.valueSchema, child, visit, childPath, depth + 1);
  }
}
export function identityFields(schema: Schema, raw: unknown): { path: string; value: string }[] {
  const result: { path: string; value: string }[] = [];
  visitValue(schema, raw, ({ path, value }) => {
    if (path.split(".").at(-1) === "id" && typeof value === "string") result.push({ path, value });
  });
  return result;
}

import { z } from "zod";
import { Condition, Effect, Outcome, Text } from "../content";
import type { Document } from "./documents";
import { describe } from "./describe";
import { hintFor, humanize } from "./hints";
import { referenceLabel } from "./references";
import { refKind, unwrap, type Schema } from "./schema";

const short = (value: string, length: number) => { const text = value.trim(); return text.length > length ? text.slice(0, length) + "…" : text; };
function isNode(schema: Schema, target: Schema): boolean {
  while (schema !== target) {
    if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable || schema instanceof z.ZodDefault) schema = schema._def.innerType;
    else if (schema instanceof z.ZodEffects) schema = schema._def.schema;
    else return unwrap(schema) === unwrap(target);
  }
  return true;
}
export function summarize(schema: Schema, value: Record<string, unknown>, keys: string[], documents: Document[]): string {
  const object = unwrap(schema);
  if (!(object instanceof z.ZodObject)) return "";
  return keys.flatMap(key => {
    const v = value[key], field = object.shape[key] as Schema | undefined;
    if (key === "id" || v === undefined || !field) return [];
    const node = unwrap(field), hint = hintFor(schema, key), label = hint?.label ?? humanize(key), kind = refKind(field);
    if (kind && typeof v === "string") return [referenceLabel(kind, v, documents)];
    if (isNode(field, Condition)) return [`${label.toLowerCase()}: ${describe(v, "condition", documents)}`];
    if (isNode(field, Text)) {
      const first = typeof v === "string" ? v : Array.isArray(v) ? v[0] : (v as { variants?: unknown[] } | null)?.variants?.[0];
      return typeof first === "string" ? [`“${short(first, 50)}”`] : [];
    }
    if (node instanceof z.ZodArray && isNode(node.element, Effect) && Array.isArray(v)) return [v.map(effect => describe(effect, "effect", documents)).join(", ")];
    if (node instanceof z.ZodArray && isNode(node.element, Outcome) && Array.isArray(v)) {
      const rows = v.map(value => value && typeof value === "object" ? value as Record<string, unknown> : {});
      const total = rows.reduce((sum, row) => sum + (typeof row.weight === "number" ? row.weight : 0), 0);
      const prefix = rows.some(row => row.when !== undefined) ? "≈" : "";
      return [rows.map(row => `${prefix}${total === 0 ? "—" : `${Math.round((typeof row.weight === "number" ? row.weight : 0) / total * 100)}%`} ${Array.isArray(row.effects) && row.effects.length ? describe(row.effects[0], "effect", documents) : "nothing"}`).join(" · ")];
    }
    if (typeof v === "string") return [short(v, 40)];
    if (typeof v === "number") return [`${v}${hint?.unit ? ` ${hint.unit}` : ""}`];
    if (typeof v === "boolean") return v ? [label] : [];
    if (Array.isArray(v)) return [`${label.toLowerCase()}: ${v.length}`];
    return [label];
  }).filter(Boolean).join(" · ");
}

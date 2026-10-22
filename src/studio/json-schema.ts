import { z } from "zod";
import { branches, refKind, unwrap, type Schema } from "./schema";

export interface JsonSchema {
  type?: string; description?: string; enum?: unknown[]; const?: unknown;
  properties?: Record<string, JsonSchema>; required?: string[];
  additionalProperties?: boolean | JsonSchema; propertyNames?: JsonSchema; items?: JsonSchema;
  anyOf?: JsonSchema[]; $ref?: string; "x-ref"?: string;
}
export interface JsonSchemaDocument extends JsonSchema { $schema: string; $defs: Record<string, JsonSchema> }

const describeOf = (schema: Schema): string | undefined => {
  const text = schema.description ?? unwrap(schema).description;
  return text && !text.startsWith("ref:") ? text : undefined;
};

/** Studio-only view of a content schema; unsupported nodes become `{}` (no completion). */
export function toJsonSchema(root: Schema): JsonSchemaDocument {
  const $defs: Record<string, JsonSchema> = {};
  const names = new Map<Schema, string>();
  const body = (node: Schema): JsonSchema => {
    const options = branches(node);
    if (options.length) return { anyOf: options.map(convert) };
    if (node instanceof z.ZodObject) {
      const shape = node.shape as Record<string, Schema>;
      return {
        type: "object", properties: Object.fromEntries(Object.entries(shape).map(([key, child]) => [key, convert(child)])),
        required: Object.entries(shape).filter(([, child]) => !child.isOptional()).map(([key]) => key),
        additionalProperties: node._def.unknownKeys !== "strict",
      };
    }
    if (node instanceof z.ZodArray) return { type: "array", items: convert(node.element) };
    if (node instanceof z.ZodRecord) return { type: "object", additionalProperties: convert(node.valueSchema), propertyNames: convert(node.keySchema) };
    return {};
  };
  const convert = (schema: Schema): JsonSchema => {
    const node = unwrap(schema);
    const description = describeOf(schema);
    const kind = refKind(schema);
    if (kind) return { type: "string", "x-ref": kind, ...description && { description } };
    if (node instanceof z.ZodString) return { type: "string", ...description && { description } };
    if (node instanceof z.ZodNumber) return { type: node.isInt ? "integer" : "number", ...description && { description } };
    if (node instanceof z.ZodBoolean) return { type: "boolean", ...description && { description } };
    if (node instanceof z.ZodNull) return { type: "null", ...description && { description } };
    if (node instanceof z.ZodEnum) return { enum: [...node.options], ...description && { description } };
    if (node instanceof z.ZodLiteral) return { const: node.value, ...description && { description } };
    let name = names.get(node);
    if (!name) {
      name = `n${names.size}`; names.set(node, name);
      $defs[name] = {}; // reserved first so recursive schemas terminate
      $defs[name] = body(node);
    }
    return { $ref: `#/$defs/${name}`, ...description && { description } };
  };
  return { $schema: "http://json-schema.org/draft-07/schema#", ...convert(root), $defs };
}

/** Follows `$ref` and unions to the concrete alternatives a value could be. */
export function alternatives(document: JsonSchemaDocument, schema: JsonSchema | undefined, depth = 0): JsonSchema[] {
  if (!schema || depth > 50) return [];
  if (schema.$ref) {
    const target = document.$defs[schema.$ref.slice("#/$defs/".length)];
    return target ? alternatives(document, { ...target, ...schema.description && { description: schema.description }, $ref: undefined }, depth + 1) : [];
  }
  if (schema.anyOf) return schema.anyOf.flatMap((option) => alternatives(document, { ...option, description: option.description ?? schema.description }, depth + 1));
  return [schema];
}

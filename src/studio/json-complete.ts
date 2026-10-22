import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";
import { hoverTooltip, type Tooltip } from "@codemirror/view";
import { alternatives, type JsonSchema, type JsonSchemaDocument } from "./json-schema";
import { cursorAt, pathAt, type Cursor } from "./json-text";

export type ReferenceOptions = (kind: string, path: string) => string[];

const consistent = (option: JsonSchema, literals: Record<string, unknown>) =>
  Object.entries(option.properties ?? {}).every(([key, child]) => child.const === undefined || !(key in literals) || literals[key] === child.const);
const narrow = (options: JsonSchema[], literals: Record<string, unknown>) => {
  const kept = options.filter((option) => consistent(option, literals));
  return kept.length ? kept : options;
};
const descend = (document: JsonSchemaDocument, options: JsonSchema[], segment: string): JsonSchema[] =>
  options.flatMap((option) => {
    if (option.type === "array") return alternatives(document, option.items);
    const known = option.properties?.[segment];
    if (known) return alternatives(document, known);
    return typeof option.additionalProperties === "object" ? alternatives(document, option.additionalProperties) : [];
  });

/** Schema alternatives for the slot the cursor is in (the object for keys, the value otherwise). */
export function schemaAtCursor(document: JsonSchemaDocument, cursor: Cursor): JsonSchema[] {
  let options = alternatives(document, document);
  cursor.levels.forEach((level, index) => {
    options = narrow(options, level.literals);
    if (level.next !== undefined && (cursor.kind === "value" || index < cursor.levels.length - 1)) options = descend(document, options, level.next);
  });
  return options;
}
const quote = (value: unknown) => JSON.stringify(value);

export function completions(document: JsonSchemaDocument, references: ReferenceOptions, state: EditorState, position: number): CompletionResult | null {
  const cursor = cursorAt(state, position);
  if (!cursor) return null;
  const options = schemaAtCursor(document, cursor);
  const found: Completion[] = [];
  const seen = new Set<string>();
  const add = (completion: Completion) => { if (!seen.has(completion.label)) { seen.add(completion.label); found.push(completion); } };
  let from = cursor.from;
  if (!cursor.inString) from = position - (/[\w.-]*$/.exec(state.sliceDoc(Math.max(0, position - 40), position))?.[0] ?? "").length;
  // The list filters on the text before the cursor, so an existing closing quote is swallowed on accept instead.
  const applying = (text: string): Completion["apply"] => (view, _completion, start, end) => {
    const stop = cursor.inString && view.state.sliceDoc(end, end + 1) === '"' ? end + 1 : end;
    view.dispatch({ changes: { from: start, to: stop, insert: text }, selection: { anchor: start + text.length }, userEvent: "input.complete" });
  };
  const after = state.sliceDoc(cursor.to, Math.min(state.doc.length, cursor.to + 20));
  if (cursor.kind === "key") {
    const next = /^\s*:/.test(after);
    for (const option of options) {
      for (const [key, child] of Object.entries(option.properties ?? {})) {
        if (cursor.present.includes(key)) continue;
        add({ label: quote(key), detail: option.required?.includes(key) ? "required" : "optional", info: child.description, type: "property", apply: applying(`${quote(key)}${next ? "" : ": "}`), boost: option.required?.includes(key) ? 1 : 0 });
      }
      const names = option.propertyNames;
      if (typeof option.additionalProperties === "object" && names) {
        for (const candidate of alternatives(document, names)) {
          const ids = candidate["x-ref"] ? references(candidate["x-ref"], cursor.path.join(".")) : (candidate.enum ?? []).map(String);
          for (const id of ids) if (!cursor.present.includes(id)) add({ label: quote(id), detail: candidate["x-ref"], type: "variable", apply: applying(`${quote(id)}${next ? "" : ": "}`) });
        }
      }
    }
  } else {
    for (const option of options) {
      if (option["x-ref"]) for (const id of references(option["x-ref"], cursor.path.join("."))) add({ label: quote(id), detail: option["x-ref"], type: "variable", apply: applying(quote(id)) });
      for (const value of option.enum ?? []) add({ label: quote(value), type: "enum", info: option.description, apply: applying(quote(value)) });
      if (option.const !== undefined) add({ label: quote(option.const), type: "enum", info: option.description, apply: applying(quote(option.const)) });
      if (option.type === "boolean") for (const value of ["true", "false"]) add({ label: value, type: "keyword", apply: applying(value) });
    }
  }
  return found.length ? { from, to: position, options: found, filter: true } : null;
}
export const completionSource = (document: JsonSchemaDocument, references: ReferenceOptions) =>
  (context: CompletionContext) => completions(document, references, context.state, context.pos);

/** Hover text for the key or value under the pointer, only where the schema carries metadata. */
export function hoverText(document: JsonSchemaDocument, state: EditorState, position: number): string | undefined {
  const segments = pathAt(state, position);
  if (!segments.length) return undefined;
  let options = alternatives(document, document);
  for (const [index, segment] of segments.entries()) {
    const literals: Record<string, unknown> = {};
    // Narrow unions by the literal members of the enclosing object when it can be parsed.
    try {
      let node: unknown = JSON.parse(state.doc.toString());
      for (const step of segments.slice(0, index)) node = (node as Record<string, unknown>)?.[step];
      if (node && typeof node === "object" && !Array.isArray(node)) Object.assign(literals, node);
    } catch { /* incomplete documents narrow nothing */ }
    options = descend(document, narrow(options, literals), segment);
  }
  const lines = [...new Set(options.flatMap((option) => [option.description, option["x-ref"] && `Reference to a ${option["x-ref"]} id.`]).filter(Boolean))];
  return lines.length ? lines.join("\n") : undefined;
}
export const hover = (schema: JsonSchemaDocument) => hoverTooltip((view, position): Tooltip | null => {
  const text = hoverText(schema, view.state, position);
  if (!text) return null;
  return { pos: position, create: () => { const dom = window.document.createElement("div"); dom.className = "cm-json-hover"; dom.textContent = text; return { dom }; } };
});

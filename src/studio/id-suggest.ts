import type { Document } from "./documents";
import { identityFields, schemaFor } from "./schema";

/** Exactly the identity values used by StudioStore.createProblems, including drafts. */
export function takenIds(documents: Document[]): Set<string> {
  return new Set(documents.flatMap(document => {
    const schema = schemaFor(document.path);
    return schema ? identityFields(schema, document.raw).map(field => field.value) : [];
  }));
}
export function suggestId(text: string, taken: ReadonlySet<string>): string {
  const base = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!base) return "";
  let id = base;
  for (let suffix = 2; taken.has(id); suffix++) id = `${base}_${suffix}`;
  return id;
}

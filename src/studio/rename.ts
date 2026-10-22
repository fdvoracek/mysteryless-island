import { Id, formatContent } from "../content";
import { readDocuments, type Document } from "./documents";
import { identities, references, resolvesTo, type Identity } from "./references";
import { visitValue, schemaFor } from "./schema";

export interface RenamePlan {
  target: Identity; newId: string; changes: { file: string; path: string; key?: boolean }[];
  drafts: Map<string, string | null>; move?: { from: string; to: string };
}
export function replaceAt(raw: unknown, path: string, value: unknown, key = false): unknown {
  const parts = path.split(".");
  const replace = (node: unknown, index: number): unknown => {
    const name = parts[index];
    if (Array.isArray(node)) return node.map((child, i) => String(i) === name ? index === parts.length - 1 ? value : replace(child, index + 1) : child);
    if (!node || typeof node !== "object") throw new Error(`Missing field: ${path}`);
    const entries = Object.entries(node);
    if (!entries.some(([k]) => k === name)) {
      if (index !== parts.length - 1 || key) throw new Error(`Missing field: ${path}`);
      return { ...node, [name]: value };
    }
    return Object.fromEntries(entries.map(([k, child]) => k !== name ? [k, child] : index === parts.length - 1 ? [key ? String(value) : k, key ? child : value] : [k, replace(child, index + 1)]));
  };
  return replace(raw, 0);
}
const planIndexes = new WeakMap<Document[], Map<string, RenamePlan>>();
const claimedIndexes = new WeakMap<Document[], Set<string>>();
export function renamePlan(documents: Document[], file: string, path: string, newId: string): RenamePlan {
  const cacheKey = JSON.stringify([file, path, newId]);
  const cached = planIndexes.get(documents)?.get(cacheKey);
  if (cached) return cached;
  const definitions = identities(documents);
  const target = definitions.find(id => id.file === file && id.path === path);
  if (!target) throw new Error("Select an existing identity.");
  if (target.reserved) throw new Error(target.reserved);
  if (!Id.safeParse(newId).success) throw new Error("Use a lowercase snake_case ID.");
  if (newId === target.id) throw new Error("Enter a different ID.");
  // Reserve all declared IDs and local definition keys, plus action/consume tags. Local
  // scene/product keys can coincide across owners, but a new identity never captures one.
  let claimed = claimedIndexes.get(documents);
  if (!claimed) {
    claimed = new Set(definitions.map(id => id.id));
    for (const document of documents) {
      const schema = schemaFor(document.path);
      if (schema) visitValue(schema, document.raw, ({ path, value }) => {
        if (/(^|\.)tags\.\d+$/.test(path) && typeof value === "string") claimed!.add(value);
      });
    }
    claimedIndexes.set(documents, claimed);
  }
  if (claimed.has(newId) || ["explore", "travel"].includes(newId)) throw new Error("ID is already used by an identity, local definition or tag.");
  const changes = references(documents).filter(ref => resolvesTo(ref, target, documents)).map(ref => ({ file: ref.file, path: ref.path, key: ref.key }));
  changes.push({ file, path, key: target.key });
  const updated = new Map(documents.map(d => [d.path, d.raw]));
  // Children first when a local record-key identity moves their containing subtree.
  changes.sort((a, b) => b.path.split(".").length - a.path.split(".").length || a.file.localeCompare(b.file) || a.path.localeCompare(b.path));
  for (const change of changes) updated.set(change.file, replaceAt(updated.get(change.file), change.path, newId, change.key));
  const owner = documents.find(d => d.path === file)!;
  const move = path === "id" && !["settings", "trees"].includes(owner.kind) ? { from: file, to: `content/${owner.kind}/${newId}.json` } : undefined;
  if (move && documents.some(d => d.path === move.to)) throw new Error("Destination file already exists.");
  const drafts = new Map<string, string | null>();
  for (const changed of new Set(changes.map(c => c.file))) drafts.set(changed, formatContent(updated.get(changed)));
  if (move) { drafts.set(move.to, drafts.get(file)!); drafts.set(file, null); }
  const files = new Map(documents.map(d => [d.path, d]));
  for (const [p, content] of drafts) {
    if (content === null) files.delete(p);
    else files.set(p, { ...(files.get(p) ?? { ...owner, hash: "" }), path: p, content });
  }
  const problems = readDocuments([...files.values()]).diagnostics;
  if (problems.length) throw new Error(`Rename would leave registry errors: ${problems.map(p => `${p.file} › ${p.path}: ${p.message}`).join("; ")}`);
  const plan = { target, newId, changes, drafts, move };
  let index = planIndexes.get(documents);
  if (!index) { index = new Map(); planIndexes.set(documents, index); }
  index.set(cacheKey, plan);
  if (index.size > 32) index.delete(index.keys().next().value!);
  return plan;
}

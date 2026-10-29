import { buildRegistry, ContentError, formatContent, type ContentProblem } from "../content";
import { entitySchemas } from "./schema";

export interface FileDocument { path: string; content: string; encoding: "utf8" | "base64"; hash: string }
export interface Document extends FileDocument { kind: string; id: string; label: string; raw?: unknown; formatted: string }
export const kindLabels: Record<string, string> = {
  regions: "Areas", activities: "Activities", items: "Items", recipes: "Recipes", buildings: "Buildings",
  quests: "Tasks", events: "Events", sites: "Sites", artwork: "Artwork", trees: "Creation trees", settings: "Game settings", illustrations: "Illustrations",
};
export const kindSingulars: Record<string, string> = {
  regions: "area", activities: "activity", items: "item", recipes: "recipe", buildings: "building",
  quests: "task", events: "event", sites: "site", artwork: "artwork", trees: "creation tree",
};
export function defaultCreateKind(scope: string, selected?: { kind: string }): string {
  if (Object.hasOwn(entitySchemas, scope)) return scope;
  if (scope.startsWith("area:")) return "activities";
  if (scope === "all" && selected && Object.hasOwn(entitySchemas, selected.kind)) return selected.kind;
  return "items";
}
// Bounded revision caches: immutable document trees and registry diagnostics can
// be reused by rename preview/staging and history without walking a pack again.
const documentCache = new Map<string, Document>();
const revisionCache = new Map<string, { documents: Document[]; syntax: ContentProblem[]; diagnostics?: ContentProblem[] }>();
export function readDocuments(all: FileDocument[], validate = true): { documents: Document[]; diagnostics: ContentProblem[] } {
  // Studio view state (studio-layout/) is not content: never a document, a diagnostic or part of the registry.
  const files = all.filter(file => !file.path.startsWith("studio-layout/"));
  const revision = JSON.stringify(files.map(file => [file.path, file.hash, file.encoding, file.content]));
  const cached = revisionCache.get(revision);
  if (cached && (!validate || cached.diagnostics)) return { documents: cached.documents, diagnostics: validate ? cached.diagnostics! : cached.syntax };
  const parsed: Record<string, unknown> = {};
  const diagnostics: ContentProblem[] = [];
  const documents = cached?.documents ?? files.map((file) => {
    const key = JSON.stringify([file.path, file.hash, file.encoding, file.content]);
    const cached = documentCache.get(key);
    if (cached) return cached;
    const kind = file.path.startsWith("public/") ? "illustrations" : file.path.split("/").length === 2 ? "settings" : file.path.split("/")[1];
    let raw: unknown;
    if (file.encoding === "utf8") {
      try { raw = JSON.parse(file.content); parsed[file.path] = raw; }
      catch (error) { diagnostics.push({ file: file.path, path: "", message: `Invalid JSON: ${(error as Error).message}` }); }
    }
    const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const id = typeof value.id === "string" ? value.id : file.path.split("/").at(-1)!.replace(/\.json$/, "");
    const label = typeof value.name === "string" ? value.name : typeof value.title === "string" ? value.title : id;
    const document: Document = { ...file, kind, id, label, raw, formatted: raw === undefined ? file.content : formatContent(raw) };
    documentCache.set(key, document);
    if (documentCache.size > 2048) documentCache.delete(documentCache.keys().next().value!);
    return document;
  });
  // Cached documents still contribute to the complete registry input and JSON diagnostics.
  diagnostics.length = 0;
  for (const document of documents) {
    if (document.raw !== undefined) parsed[document.path] = document.raw;
    else if (document.encoding === "utf8") {
      try { JSON.parse(document.content); } catch (error) { diagnostics.push({ file: document.path, path: "", message: `Invalid JSON: ${(error as Error).message}` }); }
    }
  }
  const syntax = [...diagnostics];
  if (validate) {
    try { buildRegistry(parsed); }
    catch (error) {
      if (error instanceof ContentError) diagnostics.push(...error.diagnostics);
      else throw error;
    }
  }
  revisionCache.set(revision, { documents, syntax, diagnostics: validate ? diagnostics : undefined });
  if (revisionCache.size > 16) revisionCache.delete(revisionCache.keys().next().value!);
  return { documents, diagnostics };
}
export function areaDocuments(documents: Document[], area: Document): Document[] {
  const links = (area.raw as { activities?: unknown })?.activities;
  const activities = documents.filter(document => document.kind === "activities");
  const linkedIds = new Set(Array.isArray(links) ? links : []);
  const linked = [...linkedIds].flatMap(id => activities.filter(document => document.id === id));
  const globals = activities.filter(document => !linkedIds.has(document.id) && (document.raw as { global?: boolean })?.global)
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  return [area, ...linked, ...globals];
}
/** Diagnostics in `current` beyond those already in `baseline` (multiset match on file, path and message). */
export function introducedProblems(baseline: ContentProblem[], current: ContentProblem[]): ContentProblem[] {
  const counts = new Map<string, number>();
  const key = (p: ContentProblem) => JSON.stringify([p.file, p.path, p.message]);
  for (const p of baseline) counts.set(key(p), (counts.get(key(p)) ?? 0) + 1);
  return current.filter(p => { const left = counts.get(key(p)) ?? 0; if (left) counts.set(key(p), left - 1); return !left; });
}

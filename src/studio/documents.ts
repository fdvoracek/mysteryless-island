import { buildRegistry, ContentError, formatContent, type ContentProblem } from "../content";

export interface FileDocument { path: string; content: string; encoding: "utf8" | "base64"; hash: string }
export interface Document extends FileDocument { kind: string; id: string; label: string; raw?: unknown; formatted: string }
export const kindLabels: Record<string, string> = {
  regions: "Areas", activities: "Activities", items: "Items", recipes: "Recipes", buildings: "Buildings",
  quests: "Tasks", events: "Events", sites: "Sites", artwork: "Artwork", trees: "Creation trees", settings: "Game settings", illustrations: "Illustrations",
};
// Bounded revision caches: immutable document trees and registry diagnostics can
// be reused by rename preview/staging and history without walking a pack again.
const documentCache = new Map<string, Document>();
const revisionCache = new Map<string, { documents: Document[]; syntax: ContentProblem[]; diagnostics?: ContentProblem[] }>();
export function readDocuments(files: FileDocument[], validate = true): { documents: Document[]; diagnostics: ContentProblem[] } {
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
  return [area, ...documents.filter((document) => document.kind === "activities"
    && ((Array.isArray(links) && links.includes(document.id)) || (document.raw as { global?: boolean })?.global))];
}

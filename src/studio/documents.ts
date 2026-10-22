import { buildRegistry, ContentError, formatContent, type ContentProblem } from "../content";

export interface FileDocument { path: string; content: string; encoding: "utf8" | "base64"; hash: string }
export interface Document extends FileDocument { kind: string; id: string; label: string; raw?: unknown; formatted: string }
export const kindLabels: Record<string, string> = {
  regions: "Areas", activities: "Activities", items: "Items", recipes: "Recipes", buildings: "Buildings",
  quests: "Tasks", events: "Events", sites: "Sites", artwork: "Artwork", trees: "Creation trees", settings: "Game settings", illustrations: "Illustrations",
};
export function readDocuments(files: FileDocument[], validate = true): { documents: Document[]; diagnostics: ContentProblem[] } {
  const parsed: Record<string, unknown> = {};
  const diagnostics: ContentProblem[] = [];
  const documents = files.map((file) => {
    const kind = file.path.startsWith("public/") ? "illustrations" : file.path.split("/").length === 2 ? "settings" : file.path.split("/")[1];
    let raw: unknown;
    if (file.encoding === "utf8") {
      try { raw = JSON.parse(file.content); parsed[file.path] = raw; }
      catch (error) { diagnostics.push({ file: file.path, path: "", message: `Invalid JSON: ${(error as Error).message}` }); }
    }
    const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const id = typeof value.id === "string" ? value.id : file.path.split("/").at(-1)!.replace(/\.json$/, "");
    const label = typeof value.name === "string" ? value.name : typeof value.title === "string" ? value.title : id;
    return { ...file, kind, id, label, raw, formatted: raw === undefined ? file.content : formatContent(raw) };
  });
  if (validate) {
    try { buildRegistry(parsed); }
    catch (error) {
      if (error instanceof ContentError) diagnostics.push(...error.diagnostics);
      else throw error;
    }
  }
  return { documents, diagnostics };
}
export function areaDocuments(documents: Document[], area: Document): Document[] {
  const links = (area.raw as { activities?: unknown })?.activities;
  return [area, ...documents.filter((document) => document.kind === "activities"
    && ((Array.isArray(links) && links.includes(document.id)) || (document.raw as { global?: boolean })?.global))];
}

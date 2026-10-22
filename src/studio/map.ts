import type { Document } from "./documents";
import { replaceAt } from "./rename";

export interface Cell { x: number; y: number }
export interface MapArea {
  id: string; path: string; name: string; travelHours?: number;
  /** Explicit `region.map`, when set and well-formed. */
  map?: Cell;
  /** Where the game draws it: `map`, else its place in region order on row 0. */
  placed: Cell; isDefault: boolean; camp: boolean;
}
const isCell = (value: unknown): value is Cell => !!value && typeof value === "object" && Number.isInteger((value as Cell).x) && Number.isInteger((value as Cell).y);
/** Mirrors the registry's region order: `order` first, then id. */
export function regionOrder(documents: Document[]): string[] {
  const order = (d: Document) => (d.raw as { order?: number } | undefined)?.order ?? 999;
  return documents.filter(d => d.kind === "regions").sort((a, b) => order(a) - order(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(d => d.id);
}
export function mapAreas(documents: Document[]): MapArea[] {
  const order = regionOrder(documents);
  const start = (documents.find(d => d.path === "content/game.json")?.raw as { start?: { region?: string } } | undefined)?.start?.region;
  const regions = order.map(id => documents.find(d => d.kind === "regions" && d.id === id)!);
  const hub = regions.find(d => (d.raw as { travelHours?: number } | undefined)?.travelHours === 0)?.id ?? start;
  return regions.map(d => {
    const raw = (d.raw ?? {}) as { map?: unknown; travelHours?: number };
    const map = isCell(raw.map) ? raw.map : undefined;
    return { id: d.id, path: d.path, name: d.label, travelHours: typeof raw.travelHours === "number" ? raw.travelHours : undefined, map, placed: map ?? { x: order.indexOf(d.id), y: 0 }, isDefault: !map, camp: d.id === hub };
  });
}
export const sameCell = (a: Cell | undefined, b: Cell | undefined) => !!a && !!b && a.x === b.x && a.y === b.y;
export function occupants(areas: { id: string; at?: Cell }[], cell: Cell, except?: string): string[] {
  return areas.filter(a => a.id !== except && sameCell(a.at, cell)).map(a => a.id);
}
/** Every cell holding two or more areas. */
export function overlaps(areas: { id: string; at?: Cell }[]): { cell: Cell; ids: string[] }[] {
  const groups = new Map<string, { cell: Cell; ids: string[] }>();
  for (const a of areas) if (a.at) { const key = `${a.at.x},${a.at.y}`; groups.set(key, { cell: a.at, ids: [...groups.get(key)?.ids ?? [], a.id] }); }
  return [...groups.values()].filter(g => g.ids.length > 1);
}
/** Visible grid window around the cells in use, at most 9 wide/high. */
export function windowFor(points: Cell[]): { minX: number; minY: number; width: number; height: number } {
  const minX = Math.min(-1, ...points.map(p => p.x)) - 1, maxX = Math.max(1, ...points.map(p => p.x)) + 1;
  const minY = Math.min(-1, ...points.map(p => p.y)) - 1, maxY = Math.max(1, ...points.map(p => p.y)) + 1;
  return { minX, minY, width: Math.min(9, maxX - minX + 1), height: Math.min(9, maxY - minY + 1) };
}
export const formatHours = (hours: number | undefined) => hours === undefined ? "unset" : hours === 0 ? "camp" : `${hours} h`;
/** The area file with only `map` set; refuses an occupied cell before anything is staged. */
export function moveArea(documents: Document[], id: string, cell: Cell): { path: string; raw: unknown } {
  const areas = mapAreas(documents), area = areas.find(a => a.id === id), doc = documents.find(d => d.path === area?.path);
  if (!area || !doc?.raw || typeof doc.raw !== "object") throw new Error(`Area ${id} cannot be moved; repair it in the JSON view.`);
  if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) throw new Error("Map cells are whole numbers.");
  const taken = occupants(areas.map(a => ({ id: a.id, at: a.placed })), cell, id);
  if (taken.length) throw new Error(`Cell ${cell.x}, ${cell.y} is occupied by ${taken.join(", ")}. ${id} was not moved.`);
  return { path: doc.path, raw: replaceAt(doc.raw, "map", { x: cell.x, y: cell.y }) };
}

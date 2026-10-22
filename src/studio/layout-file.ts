import type { Identity } from "./references";

/** Studio view state kept outside content/. Only the owner's pins live here; the game never reads it. */
export const LAYOUT_PATH = "studio-layout/story.json";
export interface Pin { x: number; y: number }
export type Pins = Record<string, Pin>;
const KEY = /^(discovery|quest|region|event|flag):[a-z0-9_]+$/;
const round = (n: number) => Math.round(n);

/** Defensive: any unreadable or unexpected shape yields no pins (and a problem), never an exception. */
export function parseLayout(text: string | undefined): { pins: Pins; problem?: string } {
  if (text === undefined) return { pins: {} };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (error) { return { pins: {}, problem: `Layout file is not valid JSON: ${(error as Error).message}` }; }
  const record = raw as { version?: unknown; pins?: unknown } | null;
  if (!record || typeof record !== "object" || Array.isArray(record) || record.version !== 1 || !record.pins || typeof record.pins !== "object" || Array.isArray(record.pins)) {
    return { pins: {}, problem: "Layout file has an unsupported shape." };
  }
  const pins: Pins = {};
  for (const [key, value] of Object.entries(record.pins)) {
    const p = value as Partial<Pin> | null;
    if (KEY.test(key) && p && typeof p.x === "number" && typeof p.y === "number" && Number.isFinite(p.x) && Number.isFinite(p.y)) pins[key] = { x: round(p.x), y: round(p.y) };
  }
  return { pins };
}
/** Stable output: sorted keys, integer coordinates, one pin per line for readable git diffs. */
export function serializeLayout(pins: Pins): string {
  const keys = Object.keys(pins).sort();
  if (!keys.length) return '{\n  "version": 1,\n  "pins": {}\n}\n';
  return `{\n  "version": 1,\n  "pins": {\n${keys.map(key => `    ${JSON.stringify(key)}: { "x": ${round(pins[key].x)}, "y": ${round(pins[key].y)} }`).join(",\n")}\n  }\n}\n`;
}
/** Keeps only pins whose node still exists. Returns the same object when nothing changes. */
export function prunePins(pins: Pins, nodeIds: ReadonlySet<string>): Pins {
  const keys = Object.keys(pins);
  return keys.every(key => nodeIds.has(key)) ? pins : Object.fromEntries(keys.filter(key => nodeIds.has(key)).map(key => [key, pins[key]]));
}
/** A pin that already exists under the new key (dragged after the rename) wins. */
export function renamePin(pins: Pins, from: string, to: string): Pins {
  if (!(from in pins) || from === to) return pins;
  const { [from]: moved, ...rest } = pins;
  return { ...rest, [to]: rest[to] ?? moved };
}
/** Story node key of a renamed identity, or undefined when the identity is not a story node. */
export function nodeKey(identity: Identity, id = identity.id): string | undefined {
  if (identity.path !== "id" && identity.kind !== "discovery") return undefined;
  if (["quest", "discovery", "region"].includes(identity.kind)) return `${identity.kind}:${id}`;
  // Event files carry no entity-kind entry in the identity table.
  return identity.file.startsWith("content/events/") && identity.path === "id" ? `event:${id}` : undefined;
}

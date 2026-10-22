import { defaultOptions, type StoryOptions } from "./story-layout";

/** Per-viewer story view state (options and viewport). localStorage may be absent, blocked or corrupt; reads never throw. */
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
export interface Viewport { x: number; y: number; zoom: number }
export interface StoryPrefs { options: StoryOptions; viewport?: Viewport }
export const PREFS_KEY = "studio.storyView";
const browserStorage = (): Storage | undefined => { try { return globalThis.localStorage; } catch { return undefined; } };
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function readPrefs(storage: Storage | undefined = browserStorage()): StoryPrefs {
  try {
    const raw = JSON.parse(storage?.getItem(PREFS_KEY) ?? "null") as { options?: Partial<StoryOptions>; viewport?: Partial<Viewport> } | null;
    const o = raw?.options ?? {}, v = raw?.viewport;
    return {
      options: {
        direction: o.direction === "TB" ? "TB" : "LR",
        spacing: o.spacing === "compact" || o.spacing === "wide" ? o.spacing : "normal",
        group: o.group === true, allReferences: o.allReferences === true, depth: o.depth === 2 ? 2 : 1,
      },
      viewport: v && finite(v.x) && finite(v.y) && finite(v.zoom) && v.zoom > 0 ? { x: v.x, y: v.y, zoom: v.zoom } : undefined,
    };
  } catch { return { options: { ...defaultOptions } }; }
}
export function writePrefs(prefs: StoryPrefs, storage: Storage | undefined = browserStorage()) {
  try { storage?.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* remembering is optional */ }
}

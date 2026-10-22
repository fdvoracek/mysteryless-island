export type EditorMode = "form" | "json";
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
const key = (path: string) => `studio.editorMode:${path}`;
const browserStorage = (): Storage | undefined => { try { return globalThis.localStorage; } catch { return undefined; } };

/** Settings files (game, stats, climate) are mostly flat values and open in JSON; everything else in the form. */
export const defaultMode = (kind: string): EditorMode => kind === "settings" ? "json" : "form";
export function readMode(path: string, kind: string, storage: Storage | undefined = browserStorage()): EditorMode {
  try {
    const stored = storage?.getItem(key(path));
    if (stored === "form" || stored === "json") return stored;
  } catch { /* storage may be blocked */ }
  return defaultMode(kind);
}
export function rememberMode(path: string, mode: EditorMode, storage: Storage | undefined = browserStorage()) {
  try { storage?.setItem(key(path), mode); } catch { /* remembering is optional */ }
}

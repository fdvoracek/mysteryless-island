import { GameStateSchema } from "../core/state-schema";
import type { Registry } from "../content/registry";
import { SAVE_VERSION, type GameState } from "../core/state";
import { restoreState } from "./migrate";

/**
 * Two things are kept in the browser (localStorage):
 * - the autosave ("textisland.save"): the game as it is now, written after every action, so a reload
 *   continues where you were (including a death: death is permanent);
 * - the saved game ("textisland.saved"): written only when you choose "save."; after death you can
 *   load it instead of starting again.
 * Browser storage can be missing or throw (private mode); that never breaks the game.
 */
const AUTO = "textisland.save";
const SLOT = "textisland.saved";
const PREVIEW_AUTO = "textisland.preview.save";
const PREVIEW_SLOT = "textisland.preview.saved";

/** The Studio preview (?preview) plays in its own slots and never touches the player's. */
export const isPreview = (search = typeof location === "undefined" ? "" : location.search) => new URLSearchParams(search).has("preview");
/** &seed=<digits> in preview mode starts a new game with that seed; anything else is ignored. */
export function previewSeed(search = typeof location === "undefined" ? "" : location.search): number | undefined {
  const seed = new URLSearchParams(search).get("seed");
  return isPreview(search) && seed !== null && /^\d+$/.test(seed) && Number.isSafeInteger(Number(seed)) ? Number(seed) : undefined;
}
const autoKey = () => (isPreview() ? PREVIEW_AUTO : AUTO);
const slotKey = () => (isPreview() ? PREVIEW_SLOT : SLOT);

interface SaveFile {
  saveVersion: number;
  current: GameState;
  /** when the player saved (real time), shown nowhere yet; useful for a "saved at" later */
  savedAt?: string;
}

function write(key: string, state: GameState, extra: Partial<SaveFile> = {}) {
  try {
    const file: SaveFile = { saveVersion: SAVE_VERSION, current: state, ...extra };
    localStorage.setItem(key, JSON.stringify(file));
    return true;
  } catch {
    return false;
  }
}

export interface SaveRead { state: GameState | null; error?: string }

function requiresFreshGame(version: unknown): boolean {
  return typeof version === "number" && Number.isInteger(version) && version >= 1 && version < SAVE_VERSION;
}

function read(key: string, reg: Registry): SaveRead {
  let raw: string | null;
  try { raw = localStorage.getItem(key); } catch { return { state: null }; }
  if (!raw) return { state: null };
  try {
    const file = JSON.parse(raw) as SaveFile;
    if (requiresFreshGame(file.saveVersion) || requiresFreshGame(file.current?.saveVersion)) {
      return { state: null, error: "This save is from an older version of the game. Start a new game to continue. Your saved data has been kept." };
    }
    if (!Number.isInteger(file.saveVersion) || file.saveVersion !== SAVE_VERSION) {
      return { state: null, error: "This save uses an unsupported version. Your saved data has been kept." };
    }
    const state = restoreState(file.current, reg);
    if (state) return { state };
  } catch { /* malformed data is reported without overwriting it */ }
  return { state: null, error: "This save could not be loaded. Your saved data has been kept." };
}

/** The autosave: the game as it is now. */
export const writeSave = (state: GameState) => write(autoKey(), state);
export const readSaveStatus = (reg: Registry) => read(autoKey(), reg);
export const readSave = (reg: Registry) => readSaveStatus(reg).state;
export function clearSave() {
  try { localStorage.removeItem(autoKey()); } catch { /* ignore */ }
}

/** The saved game: only when the player saves. Returns false if the browser refused. */
export const saveGame = (state: GameState) => write(slotKey(), state, { savedAt: new Date().toISOString() });
export const loadGame = (reg: Registry) => read(slotKey(), reg).state;
export function hasSavedGame(): boolean {
  try {
    const raw = localStorage.getItem(slotKey());
    if (!raw) return false;
    const file = JSON.parse(raw) as SaveFile;
    return file.saveVersion === SAVE_VERSION && file.current?.saveVersion === SAVE_VERSION
      && GameStateSchema.safeParse(file.current).success;
  } catch { return false; }
}

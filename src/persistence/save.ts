import type { Registry } from "../content/registry";
import { SAVE_VERSION, type GameState } from "../core/state";

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

function read(key: string, reg: Registry): GameState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const file = JSON.parse(raw) as SaveFile;
    if (file.saveVersion !== SAVE_VERSION) return null; // future: run migrations here
    return isCompatible(file.current, reg) ? file.current : null;
  } catch {
    return null;
  }
}

/** The autosave: the game as it is now. */
export const writeSave = (state: GameState) => write(AUTO, state);
export const readSave = (reg: Registry) => read(AUTO, reg);
export function clearSave() {
  try { localStorage.removeItem(AUTO); } catch { /* ignore */ }
}

/** The saved game: only when the player saves. Returns false if the browser refused. */
export const saveGame = (state: GameState) => write(SLOT, state, { savedAt: new Date().toISOString() });
export const loadGame = (reg: Registry) => read(SLOT, reg);
export function hasSavedGame(): boolean {
  try { return localStorage.getItem(SLOT) !== null; } catch { return false; }
}

/** Tolerant loading: drop unknown ids, add missing regions/timers/stats from content. */
function isCompatible(s: GameState, reg: Registry): boolean {
  if (!s || !reg.regions.has(s.location)) return false;
  s.buildings ??= {};
  for (const key of Object.keys(s.buildings)) {
    const [id, region] = key.split("@");
    if (!reg.buildings.has(id) || !reg.regions.has(region)) delete s.buildings[key];
  }
  for (const id of Object.keys(s.items)) if (!reg.items.has(id)) delete s.items[id];
  for (const id of reg.regionOrder) {
    s.regions[id] ??= { unlocked: !reg.regions.get(id)!.unlockWhen, visited: false, explored: 0, discoveries: [] };
    s.regions[id].explored ??= 0;
    s.regions[id].discoveries ??= [];
  }
  for (const id of reg.timers.keys()) s.timers[id] ??= 0;
  for (const st of reg.stats.stats) s.stats[st.id] ??= reg.game.start.stats[st.id];
  s.counters ??= {};
  s.quests ??= {};
  for (const id of Object.keys(s.quests)) if (!reg.quests.has(id)) delete s.quests[id];
  return true;
}

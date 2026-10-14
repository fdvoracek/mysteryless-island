import type { Registry } from "../content/registry";
import { SAVE_VERSION, type GameState } from "../core/state";

const KEY = "textisland.save";

export interface SaveFile {
  saveVersion: number;
  current: GameState;
  checkpoint: GameState;
}

/** Browser storage can be missing or throw (private mode); never let that break the game. */
export function writeSave(current: GameState, checkpoint: GameState) {
  try {
    const file: SaveFile = { saveVersion: SAVE_VERSION, current, checkpoint };
    localStorage.setItem(KEY, JSON.stringify(file));
  } catch { /* ignore */ }
}

export function readSave(reg: Registry): SaveFile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const file = JSON.parse(raw) as SaveFile;
    if (file.saveVersion !== SAVE_VERSION) return null; // future: run migrations here
    if (!isCompatible(file.current, reg) || !isCompatible(file.checkpoint, reg)) return null;
    return file;
  } catch {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Tolerant loading: drop unknown ids, add missing regions/timers/stats from content. */
function isCompatible(s: GameState, reg: Registry): boolean {
  if (!s || !reg.regions.has(s.location)) return false;
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

import type { Registry } from "../content/registry";
import { seedRng } from "../core/rng";
import { GameStateSchema } from "../core/state-schema";
import { SAVE_VERSION, type GameState } from "../core/state";
import { initializeTimers, timerKey } from "../core/timers";

/** Validate once at the loading boundary, then reconcile references with installed content. */
export function restoreState(input: unknown, reg: Registry): GameState | null {
  // Adding a narrative stream preserves the saved gameplay stream exactly.
  if (input && typeof input === "object" && "seed" in input && typeof input.seed === "number"
    && !("narrativeRng" in input)) input = { ...input, narrativeRng: seedRng(input.seed ^ 0x4e415252) };
  const parsed = GameStateSchema.safeParse(input);
  if (!parsed.success) return null;
  const s = parsed.data;
  if (s.saveVersion < 1 || s.saveVersion > SAVE_VERSION) return null;
  // Version 2 formalizes the previously scattered version-1 defaults and reference repairs.
  if (s.saveVersion < 3) {
    for (const [text, key] of reg.textKeys) {
      if (Array.isArray(text) && s.lastText[text[0]] !== undefined) s.lastText[key] = s.lastText[text[0]];
    }
    for (const key of Object.keys(s.lastText)) if (![...reg.textKeys.values()].includes(key)) delete s.lastText[key];
  }
  s.saveVersion = SAVE_VERSION;
  if (!reg.regions.has(s.location)) s.location = reg.game.start.region;
  for (const id of Object.keys(s.items)) {
    const item = reg.items.get(id);
    if (!item) delete s.items[id];
    else s.items[id] = Math.min(s.items[id], item.max ?? Infinity);
  }
  s.seen = s.seen.filter((id) => reg.items.has(id));
  for (const id of Object.keys(s.regions)) if (!reg.regions.has(id)) delete s.regions[id];
  for (const [id, region] of reg.regions) {
    const st = s.regions[id] ??= { unlocked: !region.unlockWhen, visited: false, explored: 0, discoveries: [] };
    st.discoveries = st.discoveries.filter((d) => reg.discoveries.get(d) === id);
  }
  s.regions[s.location].unlocked = true;
  for (const key of Object.keys(s.buildings)) {
    const [id, region] = key.split("@");
    const def = reg.buildings.get(id);
    if (!def || !reg.regions.has(region)) delete s.buildings[key];
    else s.buildings[key].count = Math.min(s.buildings[key].count, def.max ?? 1);
  }
  initializeTimers(reg, s);
  const timers = new Set([...reg.timers.values()].flatMap((t) => t.local ? reg.regionOrder.map((r) => timerKey(reg, t.id, r)) : [t.id]));
  for (const key of Object.keys(s.timers)) if (!timers.has(key)) delete s.timers[key];
  for (const id of Object.keys(s.stats)) if (!reg.statIds.has(id)) { delete s.stats[id]; delete s.prevStats[id]; }
  for (const st of reg.stats.stats) {
    s.stats[st.id] ??= reg.game.start.stats[st.id];
    s.prevStats[st.id] ??= s.stats[st.id];
  }
  s.warmth = Math.min(s.warmth, reg.bandIds.length - 1);
  for (const id of Object.keys(s.quests)) if (!reg.quests.has(id)) delete s.quests[id];
  s.events.queue = s.events.queue.filter((id) => reg.events.has(id));
  for (const id of Object.keys(s.events.seen)) if (!reg.events.has(id)) delete s.events.seen[id];
  const a = s.events.active;
  if (a) {
    let valid: boolean;
    if (a.id === "note") valid = true;
    else if (a.id.startsWith("menu:")) valid = a.id === "menu:craft" || a.id === "menu:build";
    else if (a.id.startsWith("explore:")) {
      const region = reg.regions.get(a.id.slice(8));
      valid = !!region?.explore && (a.scene === "look" || region.explore.landmarks.some((d) => a.scene === `found:${d.id}`));
    } else valid = !!reg.events.get(a.id)?.scenes[a.scene];
    if (!valid) s.events.active = null;
    else if (a.go) a.go = a.go.filter((id) => s.regions[id]?.unlocked);
  }
  for (const note of s.events.notes ?? []) if (note.go) note.go = note.go.filter((id) => s.regions[id]?.unlocked);
  if (s.dead && !s.death) return null;
  s.log = s.log.slice(0, 100);
  return s;
}

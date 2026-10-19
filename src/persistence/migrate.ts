import { readyBatches } from "../core/production";
import { workExists } from "../core/work";
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
  if (input && typeof input === "object" && "events" in input && input.events && typeof input.events === "object") {
    const events = input.events as Record<string, unknown>;
    const a = events.active as Record<string, unknown> | null;
    if (a && typeof a.id === "string" && !("kind" in a)) {
      const base = { text: a.text, go: a.go };
      const active = a.id === "note" ? { ...base, kind: "note", title: a.title ?? "" }
        : a.id.startsWith("menu:") ? { ...base, kind: "menu", menu: a.id.slice(5) }
        : a.id.startsWith("explore:") ? { ...base, kind: "exploration", region: a.id.slice(8),
          landmark: typeof a.scene === "string" && a.scene.startsWith("found:") ? a.scene.slice(6) : undefined, hint: a.hint }
        : { ...base, kind: "event", event: a.id, scene: a.scene };
      input = { ...input, events: { ...events, active } };
    }
  }
  // Version 6 replaces a shared local timestamp with explicit unit/input/output batches.
  if (input && typeof input === "object" && "saveVersion" in input && typeof input.saveVersion === "number" && input.saveVersion < 6) {
    const old = input as Record<string, unknown>;
    if (old.buildings && typeof old.buildings === "object") {
      const buildings = Object.fromEntries(Object.entries(old.buildings).map(([key, value]) => {
        if (!value || typeof value !== "object") return [key, value];
        const st = value as Record<string, unknown>;
        const { startedAt, ...rest } = st;
        const meat = key.startsWith("drying_rack@") && Array.isArray(old.flags) && old.flags.includes("drying_meat");
        return [key, { ...rest, nextBatch: 2, batches: startedAt === undefined ? [] : [{
          id: 1, units: st.count ?? 1, startedAt, inputs: {}, ...(meat ? { production: "meat" } : {}),
        }] }];
      }));
      const actions = Array.isArray(old.actions) ? old.actions.map((value) => {
        if (!value || typeof value !== "object" || !value.work || typeof value.work !== "object") return value;
        const work = value.work;
        if (work.kind !== "building" || work.step !== "collect") return value;
        return { ...value, work: { ...work, collections: [{ id: 1, units: work.units, batches: work.batches }] } };
      }) : old.actions;
      input = { ...old, buildings, actions, flags: Array.isArray(old.flags) ? old.flags.filter((f) => f !== "drying_meat") : old.flags };
    }
  }
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
    else {
      const st = s.buildings[key];
      st.count = Math.min(st.count, def.max ?? 1);
      let units = st.count;
      st.batches = st.batches.filter((batch) => {
        if (!def.cycle || (batch.production && !def.cycle.products?.[batch.production])) return false;
        batch.units = Math.min(batch.units, units);
        units -= batch.units;
        for (const item of Object.keys(batch.inputs)) if (!reg.items.has(item)) delete batch.inputs[item];
        return batch.units > 0;
      });
    }
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
    switch (a.kind) {
      case "note": case "menu": valid = true; break;
      case "exploration": {
        const region = reg.regions.get(a.region);
        valid = !!region?.explore && (!a.landmark || region.explore.landmarks.some((d) => d.id === a.landmark));
        break;
      }
      case "event": valid = !!reg.events.get(a.event)?.scenes[a.scene]; break;
    }
    if (!valid) s.events.active = null;
    else if (a.go) a.go = a.go.filter((id) => s.regions[id]?.unlocked);
  }
  for (const note of s.events.notes ?? []) if (note.go) note.go = note.go.filter((id) => s.regions[id]?.unlocked);
  s.actions = s.actions.filter((action) => {
    const exists = reg.regions.has(action.location) && workExists(reg, action.work)
      && (action.work.kind !== "building" || action.work.step === "build" || !!s.buildings[`${action.work.id}@${action.location}`]);
    if (!exists) {
      for (const [item, amount] of Object.entries(action.reserved)) {
        const def = reg.items.get(item);
        if (def) s.items[item] = Math.min(def.max ?? Infinity, (s.items[item] ?? 0) + amount);
      }
    } else {
      if (action.work.kind === "building" && action.work.step === "collect") {
        const def = reg.buildings.get(action.work.id)!;
        const st = s.buildings[`${action.work.id}@${action.location}`];
        const claimed = new Set<number>();
        action.work.collections = action.work.collections.flatMap((claim) => {
          const batch = st.batches.find((batch) => batch.id === claim.id);
          if (!batch || claimed.has(claim.id)) return [];
          claimed.add(claim.id);
          const batches = Math.min(claim.batches, readyBatches(def, batch, s.time));
          return batches ? [{ ...claim, units: Math.min(claim.units, batch.units), batches }] : [];
        });
      }
      // Completion notes compare against this snapshot, which may predate removed content.
      for (const id of Object.keys(action.before.items)) if (!reg.items.has(id)) delete action.before.items[id];
      action.completedMinutes = Math.min(action.completedMinutes, action.requiredMinutes);
      if (action.location !== s.location) action.status = "paused";
    }
    return exists;
  });
  if (s.dead && !s.death) return null;
  s.log = s.log.slice(0, 100);
  return s;
}

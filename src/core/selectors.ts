import { clockText, day, phaseAt } from "./clock";
import type { Engine } from "./engine";

/** View models: everything the UI (or a simulator bot) needs, with no game logic left to do. */

export interface ButtonView {
  id: string;
  label: string;
  enabled: boolean;
  reason?: string;
  tooltip: string[];
}

export interface StatusLine {
  id: string;
  label: string;
  /** null for lines shown as a word only (timers such as the fire) */
  stars: number | null;
  /** the descriptive word, shown on hover for star lines */
  word: string;
  trend: "better" | "worse" | "";
  bad: boolean;
}

export interface View {
  title: string;
  tabs: Array<{ id: string; label: string; here: boolean }>;
  actions: ButtonView[];
  status: {
    day: number;
    clock: string;
    phase: string;
    maxStars: number;
    lines: StatusLine[];
  };
  stores: Array<{ id: string; label: string; count: number; use?: { verb: string; tooltip: string[] } }>;
  log: string[];
  dead: boolean;
}

export function view(engine: Engine): View {
  const { reg, state: s } = engine;
  const region = reg.regions.get(s.location)!;

  const tabs = reg.regionOrder
    .filter((id) => s.regions[id]?.unlocked)
    .map((id) => {
      const r = reg.regions.get(id)!;
      const hours = id === s.location ? 0 : region.travelHours + r.travelHours;
      return { id, label: hours ? `${r.name} · ${fmtHours(hours)}` : r.name, here: id === s.location };
    });

  const actions: ButtonView[] = [];
  for (const a of region.activities) {
    const c = engine.check(a);
    if (!c.visible) continue;
    const tooltip = [`${fmtHours(a.hours)} · ${a.effort}`];
    for (const [k, n] of Object.entries(a.cost ?? {})) tooltip.push(`${reg.items.get(k)?.name ?? k}: ${n}`);
    actions.push({ id: a.id, label: a.name, enabled: c.enabled, reason: c.reason, tooltip });
  }

  const maxStars = reg.stats.maxStars ?? 5;
  const lines: StatusLine[] = [];
  for (const st of reg.stats.stats) {
    const v = s.stats[st.id] ?? 0;
    const word = st.words.find((w) => v <= w.upTo)?.word ?? st.words[st.words.length - 1].word;
    const delta = v - (s.prevStats[st.id] ?? v);
    const highIsBad = !!st.highIsBad;
    const stars = toStars(highIsBad ? 100 - v : v, maxStars);
    const worse = highIsBad ? delta > 0.5 : delta < -0.5;
    const better = highIsBad ? delta < -0.5 : delta > 0.5;
    lines.push({
      id: st.id, label: st.label ?? st.name, stars, word,
      trend: worse ? "worse" : better ? "better" : "", bad: stars <= 1,
    });
  }
  const band = reg.climate.bodyBands[s.warmth];
  lines.push({
    id: "warmth", label: reg.climate.warmthLabel ?? "warmth", stars: Math.min(band.stars, maxStars), word: band.id,
    trend: "", bad: band.stars <= 1,
  });
  for (const t of reg.timers.values()) {
    const hours = (s.timers[t.id] ?? 0) / 60;
    const word = t.states.find((x) => hours <= x.upToHours)?.word ?? t.states[t.states.length - 1].word;
    lines.push({ id: t.id, label: t.name, stars: null, word, trend: "", bad: false });
  }

  const stores: View["stores"] = [];
  for (const [id, count] of Object.entries(s.items)) {
    if (count <= 0) continue;
    const item = reg.items.get(id);
    if (!item) continue;
    const use = item.consume
      ? { verb: item.consume.verb, tooltip: [`${fmtHours(item.consume.hours)}`] }
      : undefined;
    stores.push({ id, label: item.name, count, use });
  }
  stores.sort((a, b) => a.label.localeCompare(b.label));

  return {
    title: region.title,
    tabs,
    actions,
    status: { day: day(s.time), clock: clockText(s.time), phase: phaseAt(reg, s.time).id, maxStars, lines },
    stores,
    log: s.log.map((l) => l.text),
    dead: s.dead,
  };
}

/**
 * Map a 0..100 "goodness" value to stars. Each star covers an equal slice and rounds up,
 * so 0 stars appears only at exactly 0 (for health: death).
 */
export function toStars(goodness: number, maxStars: number): number {
  const g = Math.max(0, Math.min(100, goodness));
  // Math.max(0, …) also turns Math.ceil(-1e-9) = -0 into a plain 0
  return Math.max(0, Math.min(maxStars, Math.ceil((g / 100) * maxStars - 1e-9)));
}

export function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

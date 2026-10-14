import { clockText, day, phaseAt } from "./clock";
import type { Command, Engine } from "./engine";

/** View models: everything the UI (or a simulator bot) needs, with no game logic left to do. */

export interface ButtonView {
  id: string;
  command: Command;
  label: string;
  enabled: boolean;
  reason?: string;
  tooltip: string[];
}

export interface StatusLine {
  id: string;
  label: string;
  /** bar fill 0..100 (more is better); null for lines shown as a word only */
  fill: number | null;
  /** the descriptive word, shown on hover for bar lines */
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
    lines: StatusLine[];
  };
  /** active quests only, in content order */
  quests: Array<{ id: string; title: string; hint?: string }>;
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
  const ex = engine.checkExplore();
  if (ex.visible && region.explore) {
    const progress = ex.found === 0 ? "unexplored" : ex.found < ex.total ? "partly explored" : "fully explored";
    actions.push({
      id: `explore:${region.id}`, command: { type: "explore" }, label: region.explore.name,
      enabled: ex.enabled, reason: ex.reason,
      tooltip: [`${fmtHours(region.explore.hours)} · ${region.explore.effort}`, progress],
    });
  }
  for (const a of region.activities) {
    const c = engine.check(a);
    if (!c.visible) continue;
    const tooltip = [`${fmtHours(a.hours)} · ${a.effort}`];
    for (const [k, n] of Object.entries(a.cost ?? {})) tooltip.push(`${reg.items.get(k)?.name ?? k}: ${n}`);
    actions.push({ id: a.id, command: { type: "activity", id: a.id }, label: a.name, enabled: c.enabled, reason: c.reason, tooltip });
  }

  const danger = reg.stats.dangerAtOrBelow ?? 20;
  const lines: StatusLine[] = [];
  for (const st of reg.stats.stats) {
    const v = s.stats[st.id] ?? 0;
    const word = st.words.find((w) => v <= w.upTo)?.word ?? st.words[st.words.length - 1].word;
    const delta = v - (s.prevStats[st.id] ?? v);
    const highIsBad = !!st.highIsBad;
    const fill = clampPct(highIsBad ? 100 - v : v);
    const worse = highIsBad ? delta > 0.5 : delta < -0.5;
    const better = highIsBad ? delta < -0.5 : delta > 0.5;
    lines.push({
      id: st.id, label: st.label ?? st.name, fill, word,
      trend: worse ? "worse" : better ? "better" : "", bad: fill <= danger,
    });
  }
  const band = reg.climate.bodyBands[s.warmth];
  lines.push({
    id: "comfort", label: reg.climate.warmthLabel ?? "comfort", fill: band.fill, word: band.id,
    trend: "", bad: band.fill <= danger,
  });
  for (const t of reg.timers.values()) {
    if (t.showInStatus === false) continue;
    const hours = (s.timers[t.id] ?? 0) / 60;
    const word = t.states.find((x) => hours <= x.upToHours)?.word ?? t.states[t.states.length - 1].word;
    lines.push({ id: t.id, label: t.name, fill: null, word, trend: "", bad: false });
  }

  const quests: View["quests"] = [];
  for (const q of reg.quests.values()) {
    if (s.quests[q.id]?.status === "active") quests.push({ id: q.id, title: q.title, hint: q.hint });
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
    status: { day: day(s.time), clock: clockText(s.time), phase: phaseAt(reg, s.time).id, lines },
    quests,
    stores,
    log: s.log.map((l) => l.text),
    dead: s.dead,
  };
}

/** Clamp to 0..100 and round to one decimal so the bar width is stable. */
export function clampPct(v: number): number {
  return Math.round(Math.max(0, Math.min(100, v)) * 10) / 10;
}

export function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

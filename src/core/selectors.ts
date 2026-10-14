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

export interface View {
  title: string;
  tabs: Array<{ id: string; label: string; here: boolean }>;
  actions: ButtonView[];
  status: {
    day: number;
    clock: string;
    phase: string;
    lines: Array<{ label: string; word: string; trend: "up" | "down" | "" ; bad: boolean }>;
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

  const lines: View["status"]["lines"] = [];
  for (const st of reg.stats.stats) {
    const v = s.stats[st.id] ?? 0;
    const word = st.words.find((w) => v <= w.upTo)?.word ?? st.words[st.words.length - 1].word;
    const prev = s.prevStats[st.id] ?? v;
    const delta = v - prev;
    const highIsBad = !!st.highIsBad;
    const worse = highIsBad ? delta > 0.5 : delta < -0.5;
    const better = highIsBad ? delta < -0.5 : delta > 0.5;
    const idx = st.words.findIndex((w) => w.word === word);
    const bad = highIsBad ? idx >= st.words.length - 1 : idx === 0;
    lines.push({ label: st.name, word, trend: worse ? "down" : better ? "up" : "", bad });
  }
  const band = reg.bandIds[s.warmth];
  // the outermost body bands (e.g. freezing, overheating) are the dangerous ones
  const edge = s.warmth === 0 || s.warmth === reg.bandIds.length - 1;
  lines.push({ label: "warmth", word: band, trend: "", bad: edge });
  for (const t of reg.timers.values()) {
    const hours = (s.timers[t.id] ?? 0) / 60;
    const word = t.states.find((x) => hours <= x.upToHours)?.word ?? t.states[t.states.length - 1].word;
    lines.push({ label: t.name, word, trend: "", bad: false });
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
    stores,
    log: s.log.map((l) => l.text),
    dead: s.dead,
  };
}

export function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

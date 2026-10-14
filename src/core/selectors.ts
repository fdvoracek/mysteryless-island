import { clockText, day, phaseAt } from "./clock";
import type { Command, Engine } from "./engine";
import type { GameState } from "./state";

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
  quests: Array<{
    id: string; title: string; hint?: string;
    /** cost progress for the quest action, e.g. firewood 4/10 */
    progress: Array<{ label: string; have: number; need: number }>;
    action?: ButtonView & { icon: string };
  }>;
  /** tools and clothing (categories from game.json) */
  inventory: Array<{ id: string; label: string; count: number }>;
  stores: Array<{
    id: string; label: string; count: number;
    use?: { verb: string; tooltip: string[] };
    /** icon buttons next to the item, e.g. cook over the fire */
    actions: Array<ButtonView & { icon: string }>;
  }>;
  /** story lines for a line-by-line log: newest action first, each action's lines in reading order */
  log: string[];
  /** the very last line written (e.g. "the world fades.") */
  lastLine: string;
  /** the same story grouped into one paragraph per action, newest first; lines in reading order */
  turns: Array<{ turn: number; day: number; clock: string; lines: string[] }>;
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
    if (s.quests[q.id]?.status !== "active") continue;
    const progress = Object.entries(q.action?.cost ?? {}).map(([item, need]) => ({
      label: reg.items.get(item)?.name ?? item, have: Math.min(need, s.items[item] ?? 0), need,
    }));
    let action: View["quests"][number]["action"];
    if (q.action) {
      const c = engine.checkQuestAction(q.id);
      const tooltip = [`${q.action.label} · ${fmtHours(q.action.hours)}`];
      action = {
        id: `quest:${q.id}`, command: { type: "questAction", quest: q.id }, label: q.action.label,
        icon: q.action.icon ?? "›", enabled: c.enabled, reason: c.reason, tooltip,
      };
    }
    quests.push({ id: q.id, title: q.title, hint: q.hint, progress, action });
  }

  const stores: View["stores"] = [];
  const inventory: View["inventory"] = [];
  const invCats = new Set<string>(reg.game.inventoryCategories);
  for (const [id, count] of Object.entries(s.items)) {
    if (count <= 0) continue;
    const item = reg.items.get(id);
    if (!item) continue;
    if (invCats.has(item.category)) { inventory.push({ id, label: item.name, count }); continue; }
    const use = item.consume
      ? { verb: item.consume.verb, tooltip: [`${fmtHours(item.consume.hours)}`] }
      : undefined;
    const actions: View["stores"][number]["actions"] = [];
    for (const a of item.actions ?? []) {
      const c = engine.checkItemAction(id, a);
      if (!c.visible) continue;
      actions.push({
        id: `item:${id}:${a.id}`, command: { type: "itemAction", item: id, action: a.id }, label: a.label, icon: a.icon,
        enabled: c.enabled, reason: c.reason, tooltip: [`${a.label} · ${fmtHours(a.hours)}`],
      });
    }
    stores.push({ id, label: item.name, count, use, actions });
  }
  stores.sort((a, b) => a.label.localeCompare(b.label));
  inventory.sort((a, b) => a.label.localeCompare(b.label));

  const turns = groupTurns(s.log);

  return {
    title: region.title,
    tabs,
    actions,
    status: { day: day(s.time), clock: clockText(s.time), phase: phaseAt(reg, s.time).id, lines },
    quests,
    inventory,
    stores,
    log: turns.flatMap((t) => t.lines),
    lastLine: s.log[0]?.text ?? "",
    turns,
    dead: s.dead,
  };
}

/** Group the newest-first log into turns (one per command); lines inside a turn read top-down. */
export function groupTurns(log: GameState["log"]): View["turns"] {
  const out: View["turns"] = [];
  for (const entry of log) {
    // old saves have no turn numbers: fall back to grouping by time
    const key = entry.turn ?? -entry.at - 1;
    const last = out[out.length - 1];
    if (last && last.turn === key) {
      // older line of the same action: the paragraph's time becomes the earliest (when the action started)
      last.lines.unshift(entry.text);
      last.day = day(entry.at);
      last.clock = clockText(entry.at);
    } else out.push({ turn: key, day: day(entry.at), clock: clockText(entry.at), lines: [entry.text] });
  }
  return out;
}

/** Clamp to 0..100 and round to one decimal so the bar width is stable. */
export function clampPct(v: number): number {
  return Math.round(Math.max(0, Math.min(100, v)) * 10) / 10;
}

export function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

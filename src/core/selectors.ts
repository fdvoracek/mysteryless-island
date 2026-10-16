import { clockText, day, phaseAt } from "./clock";
import { sentence } from "./text";
import type { Command, Engine } from "./engine";
import type { GameState } from "./state";

/** View models: everything the UI (or a simulator bot) needs, with no game logic left to do. */

export interface ButtonView {
  id: string;
  command: Command;
  label: string;
  /** a small mark after the label, e.g. "*" on look around while something is left to explore */
  badge?: string;
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
  /** the places you know (the nodes of the route map) */
  tabs: Array<{ id: string; label: string; here: boolean; hours: number; col: number; row: number }>;
  /**
   * The route map: a grid of cols x rows; paths from the camp to each place, labelled with the
   * walking time; places not found yet are "?" at the end of a dashed path.
   */
  map: {
    cols: number; rows: number;
    unknown: Array<{ col: number; row: number }>;
    paths: Array<{ from: { col: number; row: number }; to: { col: number; row: number }; unknown: boolean }>;
  };
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
    action?: ButtonView;
  }>;
  /** tools and clothing (categories from game.json) */
  inventory: Array<{ id: string; label: string; count: number; actions: ButtonView[] }>;
  stores: Array<{
    id: string; label: string; count: number;
    use?: { verb: string; tooltip: string[] };
    /** buttons next to the item, e.g. cook over the fire */
    actions: ButtonView[];
  }>;
  /** story lines for a line-by-line log: newest action first, each action's lines in reading order */
  log: string[];
  /** the very last line written (e.g. "the world fades.") */
  lastLine: string;
  /** the same story grouped into one paragraph per action, newest first; lines in reading order */
  turns: Array<{ turn: number; day: number; clock: string; lines: string[] }>;
  dead: boolean;
  /** after death (permanent): the end screen's title, lines (how long, why, the story) and button */
  end: { title: string; lines: string[]; restart: string; load: string } | null;
  /** the open event (a modal), if any: title, the scene's text and its buttons */
  event: {
    id: string; title: string; text: string;
    /** a "start" event: the story before the island, shown without the game behind it */
    prologue: boolean;
    /** `time`: how long the choice takes, shown next to it (landmarks to explore) */
    choices: Array<{ id: string; label: string; enabled: boolean; reason?: string; time?: string }>;
  } | null;
}

export function view(engine: Engine): View {
  const { reg, state: s } = engine;
  const region = reg.regions.get(s.location)!;

  const { tabs, map } = routeMap(engine);

  const actions: ButtonView[] = [];
  const ex = engine.checkExplore();
  if (ex.visible && region.explore) {
    actions.push({
      id: `explore:${region.id}`, command: { type: "explore" }, label: region.explore.name,
      // * while there is something left to explore
      badge: ex.open > 0 ? "*" : undefined,
      enabled: true,
      tooltip: ["no time", ex.open > 0 ? "something here is not explored yet" : "nothing new to explore"],
    });
  }
  for (const a of region.activities) {
    const c = engine.check(a);
    if (!c.visible) continue;
    const tooltip = [`${fmtHours(a.hours)} · ${a.effort}`];
    for (const [k, n] of Object.entries(a.cost ?? {})) tooltip.push(`${reg.items.get(k)?.name ?? k}: ${n}`);
    actions.push({ id: a.id, command: { type: "activity", id: a.id }, label: a.name, enabled: c.enabled, reason: sentence(c.reason), tooltip });
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
    const qa = engine.questActionFor(q);
    const progress = Object.entries(qa?.cost ?? {}).map(([item, need]) => ({
      label: reg.items.get(item)?.name ?? item, have: Math.min(need, s.items[item] ?? 0), need,
    }));
    let action: View["quests"][number]["action"];
    if (qa) {
      const c = engine.checkQuestAction(q.id);
      const tooltip = [`${qa.label} · ${fmtHours(qa.hours)}`];
      action = {
        id: `quest:${q.id}`, command: { type: "questAction", quest: q.id }, label: qa.label,
        enabled: c.enabled, reason: sentence(c.reason), tooltip,
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
    // buttons next to the item (cook, fill...), in the stores and in the inventory alike
    const actions: ButtonView[] = [];
    for (const a of item.actions ?? []) {
      const c = engine.checkItemAction(id, a);
      if (!c.visible) continue;
      actions.push({
        id: `item:${id}:${a.id}`, command: { type: "itemAction", item: id, action: a.id }, label: a.label,
        enabled: c.enabled, reason: sentence(c.reason), tooltip: [`${a.label} · ${fmtHours(a.hours)}`],
      });
    }
    if (invCats.has(item.category)) { inventory.push({ id, label: item.name, count, actions }); continue; }
    const use = item.consume
      ? { verb: item.consume.verb, tooltip: [`${fmtHours(item.consume.hours)}`] }
      : undefined;
    stores.push({ id, label: item.name, count, use, actions });
  }
  stores.sort((a, b) => a.label.localeCompare(b.label));
  inventory.sort((a, b) => a.label.localeCompare(b.label));

  const turns = groupTurns(s.log);

  return {
    title: region.title,
    tabs,
    map,
    actions,
    status: { day: day(s.time), clock: clockText(s.time), phase: phaseAt(reg, s.time).id, lines },
    quests,
    inventory,
    stores,
    log: turns.flatMap((t) => t.lines),
    lastLine: s.log[0]?.text ?? "",
    turns,
    dead: s.dead,
    end: s.dead && s.death ? { title: reg.game.ending.title, lines: s.death.lines, restart: reg.game.ending.restart, load: reg.game.ending.load } : null,
    event: eventView(engine),
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

function eventView(engine: Engine): View["event"] {
  const active = engine.state.events.active;
  if (active?.id.startsWith("explore:")) return exploreView(engine);
  if (active?.id === "note") {
    return { id: "note", title: active.title ?? "", text: active.text, prologue: false, choices: [{ id: "close", label: "close", enabled: true }] };
  }
  const open = engine.openEventScene();
  if (!open) return null;
  const { event, scene, text } = open;
  const choices = scene.choices
    ? scene.choices.flatMap((c) => {
      const ch = engine.checkChoice(c);
      return ch.visible ? [{ id: c.id, label: c.label, enabled: ch.enabled, reason: sentence(ch.reason) }] : [];
    })
    : [{ id: "close", label: scene.close ?? "close", enabled: true }];
  return { id: event.id, title: event.title, text, prologue: event.trigger === "start", choices };
}

/** The look-around pop-up: what you see and the landmarks left (with their time), or what you found. */
function exploreView(engine: Engine): View["event"] {
  const active = engine.state.events.active!;
  const region = engine.reg.regions.get(active.id.slice("explore:".length))!;
  const ex = region.explore!;
  const close = [{ id: "close", label: "close", enabled: true }];
  const choices = active.scene === "look"
    ? [
      ...engine.openLandmarks(region).map((d) => {
        const ch = engine.checkChoice(d);
        return { id: d.id, label: d.label, enabled: ch.enabled, reason: sentence(ch.reason), time: fmtHours(d.hours) };
      }),
      ...close,
    ]
    : close;
  return { id: active.id, title: ex.title ?? region.title, text: active.text, prologue: false, choices };
}

/** The places you know and the route map between them (see View["map"]). */
function routeMap(engine: Engine): Pick<View, "tabs" | "map"> {
  const { reg, state: s } = engine;
  const pos = (id: string) => reg.regions.get(id)!.map ?? { x: reg.regionOrder.indexOf(id), y: 0 };
  // the camp: every walk goes through it (travel time = here to camp + camp to there)
  const hub = reg.regionOrder.find((id) => reg.regions.get(id)!.travelHours === 0) ?? reg.game.start.region;
  const known = reg.regionOrder.filter((id) => s.regions[id]?.unlocked);
  const unknown = reg.regionOrder.filter((id) => !s.regions[id]?.unlocked);
  const all = [...known, ...unknown].map(pos);
  const minX = Math.min(...all.map((p) => p.x)), minY = Math.min(...all.map((p) => p.y));
  const cell = (id: string) => ({ col: pos(id).x - minX, row: pos(id).y - minY });
  const here = reg.regions.get(s.location)!;
  const tabs = known.map((id) => {
    const r = reg.regions.get(id)!;
    return { id, label: r.name, here: id === s.location, hours: id === s.location ? 0 : here.travelHours + r.travelHours, ...cell(id) };
  });
  const paths = [...known, ...unknown].filter((id) => id !== hub).map((id) => ({
    from: cell(hub), to: cell(id), unknown: !s.regions[id]?.unlocked,
  }));
  return {
    tabs,
    map: {
      cols: Math.max(...all.map((p) => p.x)) - minX + 1,
      rows: Math.max(...all.map((p) => p.y)) - minY + 1,
      unknown: unknown.map(cell),
      paths,
    },
  };
}


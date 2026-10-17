import { clockText, day, phaseAt } from "./clock";
import { batchesReady, buildingKey, buildingState, evaluate } from "./conditions";
import { sentence } from "./text";
import type { Command, Engine } from "./engine";
import type { GameState } from "./state";
import { Icon } from "../content/schema";

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
  /** the craft and build menus (on the first line with look around, everywhere) */
  menu?: boolean;
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
  /** `icons`: one per kind of activity found there (fire, water, wood…), shown when you hover the place */
  tabs: Array<{ id: string; label: string; here: boolean; hours: number; col: number; row: number; icons: Icon[] }>;
  /**
   * The route map: a grid of cols x rows; paths from the camp to each place, labelled with the
   * walking time; places not found yet are "?" at the end of a dashed path.
   */
  map: {
    cols: number; rows: number;
    unknown: Array<{ col: number; row: number }>;
    paths: Array<{ from: { col: number; row: number }; to: { col: number; row: number }; label?: string; unknown: boolean }>;
  };
  actions: ButtonView[];
  status: {
    day: number;
    clock: string;
    phase: string;
    lines: StatusLine[];
  };
  /** active quests only, in content order (no buttons: things are made in the craft and build menus) */
  quests: Array<{
    id: string; title: string; hint?: string;
    /** progress towards the cost of what the task asks you to make, e.g. firewood 4/10 */
    progress: Array<{ label: string; have: number; need: number }>;
  }>;
  /**
   * Buildings standing in this place, in content order, with their state and the cycle's button
   * (sow, harvest…). New ones are built from the build menu.
   */
  buildings: Array<{
    id: string; label: string; hint?: string;
    /** how many stand here ("fish trap ×2" in the label) */
    count: number;
    /** e.g. "growing · 2d 4h", "ripe", "2 fish in the trap" */
    word: string;
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
    /**
     * `time`: how long the choice takes, shown next to it (landmarks to explore); `tooltip`: what
     * it needs (the craft and build menus)
     */
    choices: Array<{ id: string; label: string; enabled: boolean; reason?: string; time?: string; tooltip?: string }>;
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
  // the craft and build menus: everywhere, next to look around; * when something in them can be made now
  for (const menu of ["craft", "build"] as const) {
    const options = menu === "craft"
      ? engine.craftOptions().map((r) => engine.checkRecipe(r).enabled)
      : engine.buildOptions().map((id) => engine.checkBuildingStep(id, "build").enabled);
    const ready = options.filter(Boolean).length;
    actions.push({
      id: `menu:${menu}`, command: { type: "menu", menu }, label: reg.game.menus[menu].button,
      badge: ready ? "*" : undefined, enabled: true, menu: true,
      tooltip: ["no time", ready ? `${ready} can be made now` : options.length ? "nothing can be made yet" : "nothing to make yet"],
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
  const progressOf = (need?: Record<string, number>) => Object.entries(need ?? {}).map(([item, n]) => ({
    label: reg.items.get(item)?.name ?? item, have: Math.min(n, s.items[item] ?? 0), need: n,
  }));
  for (const q of reg.quests.values()) {
    if (s.quests[q.id]?.status !== "active") continue;
    // what the task asks you to make: progress towards its cost (made in the craft or build menu)
    const cost = q.craft ? engine.recipeWay(reg.recipes.get(q.craft)!)?.cost : q.build ? reg.buildings.get(q.build)!.build.cost : undefined;
    quests.push({ id: q.id, title: q.title, hint: q.hint, progress: progressOf(cost) });
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

  const buildings: View["buildings"] = [];
  for (const b of reg.buildings.values()) {
    const n = engine.builtHere(b.id);
    if (!n) continue;
    const step = engine.buildingStepFor(b.id);
    let action: ButtonView | undefined;
    if (step) {
      const c = engine.checkBuildingStep(b.id, step.step);
      const { hours, cost } = engine.stepCost(b.id, step.step);
      action = {
        id: `building:${b.id}:${step.step}`, command: { type: "building", id: b.id, step: step.step },
        label: step.def.label, enabled: c.enabled, reason: sentence(c.reason),
        tooltip: [`${fmtHours(hours)} · ${step.def.effort}`, ...Object.entries(cost).map(([k, v]) => `${reg.items.get(k)?.name ?? k}: ${v}`)],
      };
    }
    buildings.push({ id: b.id, label: n > 1 ? `${b.name} ×${n}` : b.name, hint: b.hint, count: n, word: buildingWord(engine, b.id), action });
  }

  const turns = groupTurns(s.log);

  return {
    title: region.title,
    tabs,
    map,
    actions,
    status: { day: day(s.time), clock: clockText(s.time), phase: phaseAt(reg, s.time).id, lines },
    quests,
    buildings,
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
  if (active?.id.startsWith("menu:")) return menuView(engine);
  if (active?.id === "note") {
    return { id: "note", title: active.title ?? "", text: active.text, prologue: false, choices: [...goChoices(engine), { id: "close", label: "close", enabled: true }] };
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

/**
 * The craft or build menu: one button per thing you can make (here), with its time; the tooltip
 * says what it needs. What can't be made yet is shown, disabled, with the reason.
 */
function menuView(engine: Engine): View["event"] {
  const { reg, state: s } = engine;
  const menu = s.events.active!.id.slice("menu:".length) as "craft" | "build";
  const needs = (cost: Record<string, number> | undefined, hours: number) =>
    [...Object.entries(cost ?? {}).map(([k, n]) => `${n} ${reg.items.get(k)?.name ?? k}`), fmtHours(hours)].join(" · ");
  const choices: NonNullable<View["event"]>["choices"] = menu === "craft"
    ? engine.craftOptions().map((r) => {
      const w = engine.recipeWay(r)!;
      const c = engine.checkRecipe(r);
      return { id: r.id, label: r.label ?? reg.items.get(r.item)!.name, enabled: c.enabled, reason: sentence(c.reason), time: fmtHours(w.hours), tooltip: needs(w.cost, w.hours) };
    })
    : engine.buildOptions().map((id) => {
      const b = reg.buildings.get(id)!;
      const c = engine.checkBuildingStep(id, "build");
      const built = engine.builtHere(id);
      const label = built ? `${b.name} (${built + 1} of ${b.max ?? 1})` : b.name;
      return { id, label, enabled: c.enabled, reason: sentence(c.reason), time: fmtHours(b.build.hours), tooltip: [needs(b.build.cost, b.build.hours), b.hint].filter(Boolean).join(". ") };
    });
  choices.push({ id: "close", label: "close", enabled: true });
  return { id: `menu:${menu}`, title: reg.game.menus[menu].title, text: s.events.active!.text, prologue: false, choices };
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
    : [...goChoices(engine), ...close];
  const text = active.hint ? `${active.text}\n\n${active.hint}` : active.text;
  return { id: active.id, title: ex.title ?? region.title, text, prologue: false, choices };
}

/** "go to the forest 30m": one button per place the open pop-up put on the map. */
function goChoices(engine: Engine) {
  const { reg, state: s } = engine;
  const here = reg.regions.get(s.location)!;
  return (s.events.active?.go ?? []).filter((id) => id !== s.location).map((id) => {
    const r = reg.regions.get(id)!;
    return { id: `go:${id}`, label: reg.game.newPlace.go.replace("{place}", r.name), enabled: true, time: fmtHours(here.travelHours + r.travelHours) };
  });
}

/** The buildings panel's word: built, or its cycle (idle; working and the time to the next batch; ready). */
function buildingWord(engine: Engine, id: string): string {
  const { reg, state: s } = engine;
  const b = reg.buildings.get(id)!;
  if (!b.cycle) return b.word ?? "built";
  const st = buildingState(reg, s, id, s.location);
  const w = b.cycle.words;
  if (st === "idle") return w.idle;
  const per = Math.round(b.cycle.hours * 60);
  const started = s.buildings[buildingKey(id, s.location)].startedAt!;
  const left = per - ((s.time - started) % per);
  if (st === "working") return `${w.working} · ${fmtLeft(left)}`;
  const n = batchesReady(reg, s, id, s.location);
  return w.ready.replace("{n}", String(n));
}

/** 3000 minutes -> "2d 2h"; 90 -> "1.5h"; 45 -> "45m" (time left on a building) */
export function fmtLeft(minutes: number): string {
  if (minutes >= 1440) {
    const d = Math.floor(minutes / 1440), h = Math.round((minutes % 1440) / 60);
    return h ? `${d}d ${h}h` : `${d}d`;
  }
  return fmtHours(Math.ceil(minutes / 15) * 15 / 60);
}

/** What you have found to do at a place, as map icons: the activities shown there now (each kind once, in a fixed order). */
function placeIcons(engine: Engine, regionId: string): Icon[] {
  const ctx = engine.ctx();
  const found = new Set(engine.reg.regions.get(regionId)!.activities
    .filter((a) => a.icon && evaluate(a.visibleWhen, ctx)).map((a) => a.icon!));
  // and what you have built there
  for (const key of Object.keys(engine.state.buildings)) {
    const [id, region] = key.split("@");
    const icon = engine.reg.buildings.get(id)?.icon;
    if (region === regionId && icon) found.add(icon);
  }
  return Icon.options.filter((i) => found.has(i));
}

/** The places you know and the route map between them (see View["map"]). */
function routeMap(engine: Engine): Pick<View, "tabs" | "map"> {
  const { reg, state: s } = engine;
  const pos = (id: string) => reg.regions.get(id)!.map ?? { x: reg.regionOrder.indexOf(id), y: 0 };
  // the camp: every walk goes through it (travel time = here to camp + camp to there)
  const hub = reg.regionOrder.find((id) => reg.regions.get(id)!.travelHours === 0) ?? reg.game.start.region;
  const known = reg.regionOrder.filter((id) => s.regions[id]?.unlocked);
  // a locked place shows as "?" once its hintWhen holds; until then it is not on the map at all
  const ctx = engine.ctx();
  const unknown = reg.regionOrder.filter((id) => !s.regions[id]?.unlocked && evaluate(reg.regions.get(id)!.hintWhen, ctx));
  const all = [...known, ...unknown].map(pos);
  const minX = Math.min(...all.map((p) => p.x)), minY = Math.min(...all.map((p) => p.y));
  const cell = (id: string) => ({ col: pos(id).x - minX, row: pos(id).y - minY });
  const here = reg.regions.get(s.location)!;
  const tabs = known.map((id) => {
    const r = reg.regions.get(id)!;
    return { id, label: r.name, here: id === s.location, hours: id === s.location ? 0 : here.travelHours + r.travelHours, ...cell(id), icons: placeIcons(engine, id) };
  });
  const paths = [...known, ...unknown].filter((id) => id !== hub).map((id) => ({
    from: cell(hub), to: cell(id), unknown: !s.regions[id]?.unlocked,
    label: s.regions[id]?.unlocked ? fmtHours(reg.regions.get(id)!.travelHours) : undefined,
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


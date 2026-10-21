import { requirementEntries, conditionEntry, toolRequirementEntry, type RequirementEntry } from "./action-rules";
import type { Artwork, TreeKind } from "../content/schema";
import { focusShare, workTarget } from "./work";
import { clockText, day, phaseAt } from "./clock";
import { batchesReady, buildingKey, buildingState, evaluate } from "./conditions";
import { sentence } from "./text";
import type { Command, Engine } from "./engine";
import type { GameState } from "./state";
import { Icon } from "../content/schema";
import { timerValue } from "./timers";

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

export interface TreeNodeView extends ButtonView {
  artwork?: Artwork;
  target: string; branch: string; category: string; depth: number; after: string[]; completed: boolean; unlocked: boolean;
  requirements: RequirementEntry[]; hints: string[];
  count: number; limit?: number;
  work?: { id: string; status: "running" | "paused"; completed: number; required: number };
}
export interface TreeView {
  kind: TreeKind; name: string;
  branches: Array<{ id: string; name: string; order: number }>;
  nodes: TreeNodeView[];
}
export interface View {
  trees: Record<TreeKind, TreeView>;
  title: string;
  panorama?: Artwork;
  work: Array<{ id: string; label: string; word: string; running: boolean; remaining: number; nextRemaining: number;
    target: { kind: "action" | "travel"; id: string }; actions: ButtonView[] }>;
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
  /** All available area activity buttons, also used by simulations. */
  actions: ButtonView[];
  environmentActions: ButtonView[];
  /** Items with consume or item actions; portable controls live here. */
  consumables: Array<{ id: string; label: string; count: number; tags: string[]; actions: ButtonView[]; artwork?: Artwork }>;
  status: {
    day: number;
    clock: string;
    phase: string;
    lines: StatusLine[];
  };
  /** active quests only, in content order (no buttons: things are made in the creation trees) */
  quests: Array<{ id: string; title: string }>;
  /**
   * Buildings standing in this place, in content order, with their state and the cycle's button
   * (sow, harvest…). New ones are built from the building tree.
   */
  buildings: Array<{
    id: string; label: string; hint?: string; artwork?: Artwork;
    /** how many stand here ("fish trap ×2" in the label) */
    count: number;
    /** e.g. "growing · 2d 4h", "ripe", "2 fish in the trap" */
    word: string;
    action?: ButtonView;
    actions: ButtonView[];
  }>;
  /** All other possessions, including tools, clothing and materials. */
  inventory: Array<{ id: string; label: string; count: number; tags: string[]; actions: ButtonView[]; artwork?: Artwork }>;
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
    /** Persistent control to display work chosen in this popup. */
    progressId?: string;
    /** a "start" event: the story before the island, shown without the game behind it */
    prologue: boolean;
    /**
     * `time`: how long the choice takes, shown next to it (landmarks to explore); `tooltip`: what
     * it needs
     */
    choices: Array<{ id: string; label: string; enabled: boolean; reason?: string; time?: string; hours?: number; progressId?: string; travelTo?: string; tooltip?: string }>;
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
  for (const a of engine.activities()) {
    const c = engine.check(a);
    if (!c.visible) continue;
    const tooltip = [`${fmtHours(engine.activityHours(a))} · ${a.effort}`];
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
    const hours = timerValue(reg, s, t.id) / 60;
    const word = t.states.find((x) => hours <= x.upToHours)?.word ?? t.states[t.states.length - 1].word;
    lines.push({ id: t.id, label: t.name, fill: null, word, trend: "", bad: false });
  }

  const quests = [...reg.quests.values()]
    .filter((q) => s.quests[q.id]?.status === "active")
    .map((q) => ({ id: q.id, title: q.title }));

  const carried: View["consumables"] = [];
  const inventory: View["inventory"] = [];
  for (const [id, count] of Object.entries(s.items)) {
    if (count <= 0) continue;
    const item = reg.items.get(id);
    if (!item) continue;
    // Collect visible item controls before routing building-owned actions below.
    const actions: ButtonView[] = [];
    for (const a of item.actions ?? []) {
      const c = engine.checkItemAction(id, a);
      if (!c.visible) continue;
      actions.push({
        id: `item:${id}:${a.id}`, command: { type: "itemAction", item: id, action: a.id }, label: a.label,
        enabled: c.enabled, reason: sentence(c.reason), tooltip: [`${a.label} · ${fmtHours(engine.hoursFor(a.hours, [a.visibleWhen, a.requires]))}`],
      });
    }
    const tags = (item.tool?.tags ?? []).map((t) => reg.game.tools[t].label);
    const row = { id, label: item.name, count, tags, actions, artwork: item.artwork ? reg.artwork.get(item.artwork) : undefined };
    if (item.consume || item.actions?.length) carried.push(row);
    else inventory.push(row);
  }
  carried.sort((a, b) => a.label.localeCompare(b.label));
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
    buildings.push({ artwork: b.artwork ? reg.artwork.get(b.artwork) : undefined, id: b.id, label: n > 1 ? `${b.name} ×${n}` : b.name, hint: b.hint, count: n, word: buildingWord(engine, b.id), action, actions: action ? [action] : [] });
  }

  // Presentation ownership is data-driven; commands and game rules remain unchanged.
  const activityBuildings = new Map(engine.activities().map((a) => [a.id, a.building]));
  const environmentActions = actions.filter((a) => a.command.type === "explore"
    || (a.command.type === "activity" && !activityBuildings.get(a.id)));
  for (const a of actions) {
    const owner = a.command.type === "activity" ? activityBuildings.get(a.id) : undefined;
    if (owner) buildings.find((b) => b.id === owner)?.actions.push(a);
  }
  const consumables: View["consumables"] = [];
  for (const item of carried) {
    const portable: ButtonView[] = [];
    for (const a of item.actions) {
      const owner = reg.items.get(item.id)!.actions?.find((def) => def.id === (a.command.type === "itemAction" ? a.command.action : ""))?.building;
      if (owner) buildings.find((b) => b.id === owner)?.actions.push({ ...a, label: `${a.label} ${item.label}` });
      else portable.push(a);
    }
    const consume = reg.items.get(item.id)!.consume;
    if (consume) portable.unshift({
      id: `consume:${item.id}`, command: { type: "consume", item: item.id }, label: consume.verb,
      enabled: true, tooltip: [fmtHours(consume.hours)],
    });
    consumables.push({ ...item, actions: portable });
  }

  const turns = groupTurns(s.log);
  const panoramaId = reg.game.panorama ?? region.artwork;

  return {
    title: region.title,
    panorama: panoramaId ? reg.artwork.get(panoramaId) : undefined,
    trees: { craft: treeView(engine, "craft"), build: treeView(engine, "build") },
    work: s.actions.filter((a) => a.location === s.location).map((a) => {
      const share = focusShare(engine.runningActions().length);
      return {
        id: a.id, label: a.label, word: `${a.status} · ${fmtHours(a.completedMinutes / 60)} / ${fmtHours(a.requiredMinutes / 60)}`,
        running: a.status === "running" && !s.dead && !s.events.active,
        remaining: 100 * (1 - a.completedMinutes / a.requiredMinutes),
        nextRemaining: 100 * Math.max(0, 1 - (a.completedMinutes + reg.game.stepMinutes * share) / a.requiredMinutes),
        target: workTarget(a.work),
        actions: [{ id: `work:${a.id}`, command: { type: a.status === "running" ? "pause" : "resume", id: a.id },
          label: a.status === "running" ? "pause" : "resume", enabled: !s.dead && (a.status === "running" || !engine.resumeReason(a)), reason: a.status === "paused" ? engine.resumeReason(a) : undefined, tooltip: a.status === "paused" && engine.resumeReason(a) ? [engine.resumeReason(a)!] : [] }],
      };
    }),
    tabs,
    map,
    actions,
    environmentActions,
    consumables,
    status: { day: day(s.time), clock: clockText(s.time), phase: phaseAt(reg, s.time).id, lines },
    quests,
    buildings,
    inventory,
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
  if (active?.kind === "exploration") return exploreView(engine);
  if (active?.kind === "note") {
    return { id: "note", title: active.title ?? "", text: active.text, prologue: false, choices: [...goChoices(engine), { id: "close", label: "back", enabled: true }] };
  }
  const open = engine.openEventScene();
  if (!open) return null;
  const { event, scene, text } = open;
  const choices = scene.choices
    ? scene.choices.flatMap((c) => {
      const ch = engine.checkChoice(c);
      return ch.visible ? [{ id: c.id, label: c.label, enabled: ch.enabled, reason: sentence(ch.reason) }] : [];
    })
    : [{ id: "close", label: scene.close ?? "back", enabled: true }];
  return { id: event.id, title: event.title, text, prologue: event.trigger === "start", choices };
}

/** The look-around pop-up: what you see and the landmarks left (with their time), or what you found. */
function exploreView(engine: Engine): View["event"] {
  const active = engine.state.events.active;
  if (active?.kind !== "exploration") return null;
  const region = engine.reg.regions.get(active.region)!;
  const ex = region.explore!;
  const close = [{ id: "close", label: "back", enabled: true }];
  const choices = !active.landmark
    ? [
      ...engine.openLandmarks(region).map((d) => {
        const ch = engine.checkChoice(d);
        const hours = engine.hoursFor(d.hours, [d.visibleWhen, d.requires]);
        return { id: d.id, label: d.label, enabled: ch.enabled, reason: sentence(ch.reason), time: fmtHours(hours), hours };
      }),
      ...close,
    ]
    : [...goChoices(engine), ...close];
  const text = active.hint ? `${active.text}\n\n${active.hint}` : active.text;
  return { id: `explore:${active.region}`, progressId: `explore:${active.region}`, title: ex.title ?? region.title, text, prologue: false, choices };
}

/** "go to the forest 30m": one button per place the open pop-up put on the map. */
function goChoices(engine: Engine) {
  const { reg, state: s } = engine;
  const here = reg.regions.get(s.location)!;
  return (s.events.active?.go ?? []).filter((id) => id !== s.location).map((id) => {
    const r = reg.regions.get(id)!;
    return { id: `go:${id}`, label: reg.game.newPlace.go.replace("{place}", r.name), enabled: true, travelTo: id, hours: here.travelHours + r.travelHours, time: fmtHours(here.travelHours + r.travelHours) };
  });
}

/** The buildings panel's word: built, or its cycle (idle; working and the time to the next batch; ready). */
function buildingWord(engine: Engine, id: string): string {
  const { reg, state: s } = engine;
  const b = reg.buildings.get(id)!;
  if (b.timer) {
    const timer = reg.timers.get(b.timer)!;
    const hours = timerValue(reg, s, b.timer) / 60;
    return timer.states.find((band) => hours <= band.upToHours)?.word ?? timer.states[timer.states.length - 1].word;
  }
  if (!b.cycle) return b.word ?? "built";
  const st = buildingState(reg, s, id, s.location);
  const w = b.cycle.words;
  if (st === "idle") return w.idle;
  const per = Math.round(b.cycle.hours * 60);
  const started = Math.min(...s.buildings[buildingKey(id, s.location)].batches.map((batch) => batch.startedAt));
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
  const ctx = { ...engine.ctx(), state: { ...engine.state, location: regionId } };
  const found = new Set(engine.activities(regionId)
    .filter((a) => a.icon && evaluate(a.visibleWhen, ctx)).map((a) => a.icon!));
  if (engine.reg.regions.get(regionId)?.shelterWhen && evaluate(engine.reg.regions.get(regionId)!.shelterWhen, ctx)) found.add("shelter");
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


/** Both creation tabs consume the same graph and rule vocabulary. */
export function treeView(engine: Engine, kind: TreeKind): TreeView {
  const { reg, state } = engine;
  const tree = reg.trees.get(kind)!;
  const branches = [...tree.definition.branches].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const branchOrder = new Map(branches.map((b, i) => [b.id, i]));
  const nodes = [...tree.nodes.values()].sort((a, b) => (tree.depth.get(a.target)! - tree.depth.get(b.target)!)
    || branchOrder.get(a.branch)! - branchOrder.get(b.branch)! || a.order - b.order || a.target.localeCompare(b.target)).map((node): TreeNodeView => {
    const r = kind === "craft" ? reg.recipes.get(node.target)! : undefined;
    const b = kind === "build" ? reg.buildings.get(node.target)! : undefined;
    const check = r ? engine.checkRecipe(r) : engine.checkBuildingStep(node.target, "build");
    const work = state.actions.find((a) => a.location === state.location && (kind === "craft"
      ? a.work.kind === "craft" && a.work.recipe === node.target
      : a.work.kind === "building" && a.work.step === "build" && a.work.id === node.target));
    const way = r ? work?.work.kind === "craft" ? r.ways[work.work.way] : engine.recipeWay(r) : undefined;
    const def = way ?? b?.build;
    const requirements: RequirementEntry[] = node.after.map((id) => {
      const recipe = reg.recipes.get(id);
      return { kind: "prerequisite", label: `personally ${kind === "craft" ? "craft" : "build"} ${recipe ? recipe.label ?? reg.items.get(recipe.item)!.name : reg.buildings.get(id)!.name}`,
        met: state.technology[kind].completed.includes(id) };
    });
    if (work) {
      requirements.push(toolRequirementEntry(work.toolRequirements, engine.ctx()));
      requirements.push(...Object.entries(work.reserved).map(([id, n]): RequirementEntry => ({ kind: "material", label: `${reg.items.get(id)?.name ?? id} (reserved)`, required: n, available: n, met: true })));
    } else {
      if (r?.requires) requirements.push(conditionEntry(r.requires, engine.ctx()));
      if (def) requirements.push(...requirementEntries(engine.ctx(), def));
    }
    if (r && !way) r.ways.forEach((method) => { if (method.visibleWhen) requirements.push(conditionEntry(method.visibleWhen, engine.ctx())); requirements.push(...requirementEntries(engine.ctx(), method)); });
    const hints: string[] = [];
    if (def) hints.push(`${fmtHours(work ? work.requiredMinutes / 60 : engine.hoursFor(def.hours, [r?.requires, way?.visibleWhen, def.requires]))} · ${work?.effort ?? def.effort}`);
    if (r && !r.multiple && !state.technology.craft.completed.includes(r.id) && (state.items[r.item] ?? 0) > 0) hints.push("Personal crafting completes this node; inventory stays at one copy.");
    const count = r ? state.items[r.item] ?? 0 : engine.builtHere(node.target);
    const limit = b ? b.max ?? 1 : !r?.multiple ? 1 : reg.items.get(r.item)?.max;
    if (!work && limit !== undefined) requirements.push({ kind: "limit", label: b ? "local buildings" : "inventory", required: limit, available: count,
      met: r && !r.multiple && !state.technology.craft.completed.includes(r.id) ? true
        : r?.multiple ? count + (r.count ?? 1) <= limit : count < limit });
    const artworkId = r ? reg.items.get(r.item)!.artwork : b!.artwork;
    return { id: `${kind}:${node.target}`, target: node.target, branch: node.branch, category: tree.definition.branches.find((branch) => branch.id === node.branch)!.name, depth: tree.depth.get(node.target)!, after: node.after,
      artwork: artworkId ? reg.artwork.get(artworkId) : undefined,
      label: r ? r.label ?? reg.items.get(r.item)!.name : b!.name,
      command: r ? { type: "craft", recipe: node.target } : { type: "build", building: node.target },
      enabled: work ? work.status === "paused" && !engine.resumeReason(work) : check.enabled,
      reason: work ? work.status === "running" ? "already running" : engine.resumeReason(work) : check.reason,
      tooltip: hints, hints, requirements, count, limit,
      completed: state.technology[kind].completed.includes(node.target), unlocked: state.technology[kind].unlocked.includes(node.target),
      work: work ? { id: work.id, status: work.status, completed: work.completedMinutes, required: work.requiredMinutes } : undefined };
  });
  return { kind, name: tree.definition.name, branches, nodes };
}

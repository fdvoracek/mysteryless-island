import { z } from "zod";
import { indexTextKeys } from "./text-keys";
import {
  Building, Climate, Condition, Effect, Game, GameEvent, Item, Outcome, Quest, Recipe, Region, StatsFile,
  type Activity, type BuildingStep, type Timer,
} from "./schema";

/** Frozen, indexed content. Systems read content only through this object. */
export interface Registry {
  textKeys: Map<object, string>;
  game: Game;
  stats: StatsFile;
  climate: Climate;
  items: Map<string, Item>;
  regions: Map<string, Region>;
  regionOrder: string[];
  timers: Map<string, Timer>;
  activities: Map<string, { activity: Activity; region: string }>;
  /** in file order; the tasks panel lists active quests in this order */
  quests: Map<string, Quest>;
  /** in file order (content/events/*.json) */
  events: Map<string, GameEvent>;
  /** content/buildings/*.json, in file order (the buildings panel lists them in this order) */
  buildings: Map<string, Building>;
  /** content/recipes/*.json, in file order (the craft menu lists them in this order) */
  recipes: Map<string, Recipe>;
  /** a cycle step id (sow, harvest…) -> its building and which step it is */
  buildingSteps: Map<string, { building: string; step: "start" | "collect"; def: BuildingStep }>;
  /** tags counted by { "did": tag } conditions */
  tags: Set<string>;
  /** discovery id -> region id */
  discoveries: Map<string, string>;
  statIds: Set<string>;
  bandIds: string[];
  phaseIds: Set<string>;
}

export class ContentError extends Error {
  constructor(public problems: string[]) {
    super(`content has ${problems.length} problem(s):\n` + problems.join("\n"));
  }
}

/** Remove keys starting with "_" anywhere in the tree (they are comments). */
function stripComments(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripComments);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) if (!k.startsWith("_")) out[k] = stripComments(val);
    return out;
  }
  return v;
}

function parse<T>(schema: z.ZodType<T>, data: unknown, file: string, problems: string[]): T | undefined {
  const r = schema.safeParse(stripComments(data));
  if (r.success) return r.data;
  for (const issue of r.error.issues) {
    problems.push(`${file}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  return undefined;
}

/**
 * Build the registry from a map of { "path/to/file.json": parsedJson }.
 * Paths decide the kind: game.json, stats.json, climate.json, items/*.json, regions/*.json.
 */
export function buildRegistry(files: Record<string, unknown>): Registry {
  const problems: string[] = [];
  const find = (suffix: string) => Object.keys(files).find((p) => p.endsWith(suffix));

  const need = (suffix: string) => {
    const p = find(suffix);
    if (!p) problems.push(`missing content file: ${suffix}`);
    return p;
  };
  const gamePath = need("content/game.json");
  const statsPath = need("content/stats.json");
  const climatePath = need("content/climate.json");

  const game = gamePath ? parse(Game, files[gamePath], gamePath, problems) : undefined;
  const stats = statsPath ? parse(StatsFile, files[statsPath], statsPath, problems) : undefined;
  const climate = climatePath ? parse(Climate, files[climatePath], climatePath, problems) : undefined;

  const items = new Map<string, Item>();
  const regions = new Map<string, Region>();
  const activities = new Map<string, { activity: Activity; region: string }>();
  const quests = new Map<string, Quest>();
  const events = new Map<string, GameEvent>();
  const buildings = new Map<string, Building>();
  const recipes = new Map<string, Recipe>();
  const buildingSteps = new Map<string, { building: string; step: "start" | "collect"; def: BuildingStep }>();
  const discoveries = new Map<string, string>();
  const allIds = new Map<string, string>(); // id -> where it was defined

  const claim = (id: string, where: string) => {
    const prev = allIds.get(id);
    if (prev) problems.push(`duplicate id "${id}" in ${where} (already defined in ${prev})`);
    else allIds.set(id, where);
  };

  for (const [path, data] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    if (/content\/items\/[^/]+\.json$/.test(path)) {
      const list = parse(z.array(Item), data, path, problems) ?? [];
      for (const item of list) { claim(item.id, path); items.set(item.id, item); }
    } else if (/content\/regions\/[^/]+\.json$/.test(path)) {
      const region = parse(Region, data, path, problems);
      if (!region) continue;
      claim(region.id, path);
      regions.set(region.id, region);
      for (const a of region.activities) { claim(a.id, path); activities.set(a.id, { activity: a, region: region.id }); }
      for (const d of region.explore?.landmarks ?? []) { claim(d.id, path); discoveries.set(d.id, region.id); }
    } else if (/content\/quests\/[^/]+\.json$/.test(path)) {
      const list = parse(z.array(Quest), data, path, problems) ?? [];
      for (const q of list) { claim(q.id, path); quests.set(q.id, q); }
    } else if (/content\/events\/[^/]+\.json$/.test(path)) {
      const list = parse(z.array(GameEvent), data, path, problems) ?? [];
      for (const ev of list) { claim(ev.id, path); events.set(ev.id, ev); }
    } else if (/content\/recipes\/[^/]+\.json$/.test(path)) {
      const list = parse(z.array(Recipe), data, path, problems) ?? [];
      for (const r of list) { claim(r.id, path); recipes.set(r.id, r); }
    } else if (/content\/buildings\/[^/]+\.json$/.test(path)) {
      const list = parse(z.array(Building), data, path, problems) ?? [];
      for (const b of list) {
        claim(b.id, path);
        buildings.set(b.id, b);
        if (b.cycle) {
          for (const step of ["start", "collect"] as const) {
            claim(b.cycle[step].id, path);
            buildingSteps.set(b.cycle[step].id, { building: b.id, step, def: b.cycle[step] });
          }
        }
      }
    }
  }

  if (!game || !stats || !climate) throw new ContentError(problems);

  const timers = new Map<string, Timer>();
  for (const t of game.timers) { claim(t.id, "game.json timers"); timers.set(t.id, t); }

  const statIds = new Set(stats.stats.map((s) => s.id));
  const bandIds = climate.bodyBands.map((b) => b.id);
  const phaseIds = new Set(climate.phases.map((p) => p.id));
  const tags = new Set<string>();
  for (const { activity } of activities.values()) activity.tags?.forEach((t) => tags.add(t));
  for (const { def } of buildingSteps.values()) def.tags?.forEach((t) => tags.add(t));
  for (const r of recipes.values()) r.tags?.forEach((t) => tags.add(t));
  for (const it of items.values()) {
    it.consume?.tags?.forEach((t) => tags.add(t));
    it.actions?.forEach((a) => a.tags?.forEach((t) => tags.add(t)));
  }
  for (const t of tags) if (allIds.has(t)) problems.push(`tag "${t}" has the same name as an id (${allIds.get(t)}); { "did": "${t}" } would be ambiguous`);
  const startedByEffect = new Set<string>();

  // ---------- reference checks ----------
  const ref = (kind: "item" | "region" | "timer" | "stat" | "band" | "phase" | "quest" | "did" | "discovery" | "today" | "building" | "recipe", id: string, where: string) => {
    const ok =
      kind === "item" ? items.has(id)
      : kind === "region" ? regions.has(id)
      : kind === "timer" ? timers.has(id)
      : kind === "stat" ? statIds.has(id)
      : kind === "band" ? bandIds.includes(id)
      : kind === "quest" ? quests.has(id)
      : kind === "discovery" ? discoveries.has(id)
      : kind === "building" ? buildings.has(id)
      : kind === "recipe" ? recipes.has(id)
      : kind === "did" ? activities.has(id) || items.has(id) || tags.has(id) || buildingSteps.has(id) || buildings.has(id) || recipes.has(id)
      : kind === "today" ? activities.has(id) || items.has(id) || tags.has(id) || discoveries.has(id) || regions.has(id) || quests.has(id) || buildingSteps.has(id) || buildings.has(id) || recipes.has(id)
      : phaseIds.has(id);
    if (!ok) problems.push(`${where}: unknown ${kind} "${id}"`);
  };

  const checkCond = (c: Condition, where: string): void => {
    if ("all" in c) c.all.forEach((x) => checkCond(x, where));
    else if ("any" in c) c.any.forEach((x) => checkCond(x, where));
    else if ("not" in c) checkCond(c.not, where);
    else if ("item" in c) ref("item", c.item, where);
    else if ("seen" in c) ref("item", c.seen, where);
    else if ("timer" in c) ref("timer", c.timer, where);
    else if ("at" in c) ref("region", c.at, where);
    else if ("region" in c) ref("region", c.region, where);
    else if ("stat" in c) ref("stat", c.stat, where);
    else if ("warmth" in c) c.warmth.forEach((b) => ref("band", b, where));
    else if ("phase" in c) c.phase.forEach((p) => ref("phase", p, where));
    else if ("did" in c) ref("did", c.did, where);
    else if ("today" in c) ref("today", c.today, where);
    else if ("quest" in c) ref("quest", c.quest, where);
    else if ("discovered" in c) ref("discovery", c.discovered, where);
    else if ("explored" in c) ref("region", c.explored, where);
    else if ("tool" in c) { if (!(c.tool in game.tools)) problems.push(`${where}: unknown tool tag "${c.tool}"`); }
    else if ("built" in c) ref("building", c.built, where);
    else if ("sheltered" in c) { /* local shelter is defined by region content and game.sleep.shelter */ }
    else if ("building" in c) {
      ref("building", c.building, where);
      if (buildings.has(c.building) && !buildings.get(c.building)!.cycle) problems.push(`${where}: building "${c.building}" has no cycle, so it is never ${c.is}`);
    }
  };
  const usesShelter = (c: Condition): boolean => "sheltered" in c
    || ("all" in c && c.all.some(usesShelter)) || ("any" in c && c.any.some(usesShelter))
    || ("not" in c && usesShelter(c.not));
  const checkOutcomes = (os: Outcome[] | undefined, where: string) =>
    os?.forEach((o, i) => {
      if (o.when) checkCond(o.when, `${where}.outcomes[${i}].when`);
      checkEffects(o.effects, `${where}.outcomes[${i}]`);
    });
  const checkEffects = (es: Effect[] | undefined, where: string): void =>
    es?.forEach((e, i) => {
      const w = `${where}.effects[${i}]`;
      if ("give" in e) Object.keys(e.give).forEach((k) => ref("item", k, w));
      else if ("take" in e) Object.keys(e.take).forEach((k) => ref("item", k, w));
      else if ("stat" in e) Object.keys(e.stat).forEach((k) => ref("stat", k, w));
      else if ("timer" in e) ref("timer", e.timer, w);
      else if ("roll" in e) checkOutcomes(e.roll, w);
      else if ("startQuest" in e) { ref("quest", e.startQuest, w); startedByEffect.add(e.startQuest); }
      else if ("unlock" in e) ref("region", e.unlock, w);
      else if ("build" in e) ref("building", e.build, w);
      else if ("startCycle" in e) {
        ref("building", e.startCycle, w);
        if (e.production && !buildings.get(e.startCycle)?.cycle?.products?.[e.production]) problems.push(`${w}: unknown production "${e.production}" for building "${e.startCycle}"`);
        if (buildings.has(e.startCycle) && !buildings.get(e.startCycle)!.cycle) problems.push(`${w}: building "${e.startCycle}" has no cycle to start`);
      }
    });

  // The same work vocabulary is used by activities, recipes, item actions and building steps.
  const checkWork = (a: { visibleWhen?: Condition; requires?: Condition; cost?: Record<string, number>; effects?: Effect[] }, w: string) => {
    if (a.visibleWhen) checkCond(a.visibleWhen, `${w}.visibleWhen`);
    if (a.requires) checkCond(a.requires, `${w}.requires`);
    Object.keys(a.cost ?? {}).forEach((k) => ref("item", k, `${w}.cost`));
    checkEffects(a.effects, w);
  };

  for (const q of quests.values()) {
    const w = `quest ${q.id}`;
    if (typeof q.trigger === "object") checkCond(q.trigger.when, `${w}.trigger.when`);
    checkCond(q.completeWhen, `${w}.completeWhen`);
    checkEffects(q.effects, w);
  }
  for (const r of recipes.values()) {
    const w = `recipe ${r.id}`;
    ref("item", r.item, `${w}.item`);
    if (r.availableWhen) checkCond(r.availableWhen, `${w}.availableWhen`);
    r.ways.forEach((a, i) => {
      const aw = `${w}.ways[${i}]`;
      checkWork(a, aw);
    });
  }
  for (const ev of events.values()) {
    const w = `event ${ev.id}`;
    if (!ev.scenes.start) problems.push(`${w}: needs a scene called "start"`);
    if (ev.when) checkCond(ev.when, `${w}.when`);
    const t = ev.trigger;
    if (typeof t === "object" && "when" in t) checkCond(t.when, `${w}.trigger.when`);
    if (typeof t === "object" && "after" in t) {
      for (const a of t.after ?? []) {
        const ok = a === "explore" || a === "travel" || activities.has(a) || tags.has(a) || items.has(a) || quests.has(a) || discoveries.has(a) || buildingSteps.has(a) || buildings.has(a) || recipes.has(a);
        if (!ok) problems.push(`${w}.trigger.after: unknown action "${a}" (use an activity id, a tag, an item id, "explore" or "travel")`);
      }
    }
    for (const [sid, sc] of Object.entries(ev.scenes)) {
      const sw = `${w}.scenes.${sid}`;
      checkEffects(sc.effects, sw);
      const ids = new Set<string>();
      sc.choices?.forEach((c, i) => {
        const cw = `${sw}.choices[${i}]`;
        if (ids.has(c.id)) problems.push(`${cw}: duplicate choice id "${c.id}"`);
        ids.add(c.id);
        if (c.visibleWhen) checkCond(c.visibleWhen, `${cw}.visibleWhen`);
        if (c.requires) checkCond(c.requires, `${cw}.requires`);
        checkEffects(c.effects, cw);
        if (c.next && !ev.scenes[c.next]) problems.push(`${cw}.next: unknown scene "${c.next}"`);
      });
    }
  }
  for (const r of regions.values()) {
    if (r.shelterWhen) {
      checkCond(r.shelterWhen, `region ${r.id}.shelterWhen`);
      if (usesShelter(r.shelterWhen)) problems.push(`region ${r.id}.shelterWhen cannot depend on sheltered`);
    }
    if (r.unlockWhen) checkCond(r.unlockWhen, `region ${r.id}.unlockWhen`);
    if (r.hintWhen) checkCond(r.hintWhen, `region ${r.id}.hintWhen`);
    r.arrive?.forEach((a, i) => { if (a.when) checkCond(a.when, `region ${r.id}.arrive[${i}].when`); });
    r.explore?.view.forEach((v, i) => { if (v.when) checkCond(v.when, `region ${r.id}.explore.view[${i}].when`); });
    for (const d of r.explore?.landmarks ?? []) {
      const w = `landmark ${d.id}`;
      if (d.visibleWhen) checkCond(d.visibleWhen, `${w}.visibleWhen`);
      if (d.requires) checkCond(d.requires, `${w}.requires`);
      checkEffects(d.effects, w);
    }
    for (const a of r.activities) {
      const w = `activity ${a.id}`;
      if (a.building) ref("building", a.building, `${w}.building`);
      checkWork(a, w);
      a.yields?.forEach((y, i) => { ref("item", y.item, `${w}.yields[${i}]`); if (y.when) checkCond(y.when, `${w}.yields[${i}].when`); });
      checkOutcomes(a.outcomes, w);
      for (const field of ["thoughts", "afterwards"] as const) {
        a[field]?.forEach((g, gi) => g.lines.forEach((l, li) => { if (l.when) checkCond(l.when, `${w}.${field}[${gi}].lines[${li}].when`); }));
      }
    }
  }
  for (const b of buildings.values()) {
    if (b.timer) ref("timer", b.timer, `building ${b.id}.timer`);
    const w = `building ${b.id}`;
    b.places.forEach((p, i) => { ref("region", p.region, `${w}.places[${i}]`); if (p.when) checkCond(p.when, `${w}.places[${i}].when`); });
    if (b.availableWhen) checkCond(b.availableWhen, `${w}.availableWhen`);
    checkWork(b.build, `${w}.build`);
    for (const [id, yields] of Object.entries(b.cycle?.products ?? {})) {
      yields.forEach((y, i) => {
        const yw = `${w}.cycle.products.${id}[${i}]`;
        ref("item", y.item, yw);
        if (y.when) checkCond(y.when, `${yw}.when`);
      });
    }
    for (const step of b.cycle ? [b.cycle.start, b.cycle.collect] : []) {
      const sw = `${w}.cycle.${step.id}`;
      checkWork(step, sw);
      step.yields?.forEach((y, i) => { ref("item", y.item, `${sw}.yields[${i}]`); if (y.when) checkCond(y.when, `${sw}.yields[${i}].when`); });
      checkOutcomes(step.outcomes, sw);
    }
  }
  for (const it of items.values()) {
    for (const t of it.tool?.tags ?? []) if (!(t in game.tools)) problems.push(`item ${it.id}.tool: unknown tool tag "${t}" (add it to game.json → tools)`);
    for (const a of it.actions ?? []) {
      const w = `item ${it.id}.actions.${a.id}`;
      if (a.building) ref("building", a.building, `${w}.building`);
      checkWork(a, w);
    }
    if (new Set((it.actions ?? []).map((a) => a.id)).size !== (it.actions ?? []).length) problems.push(`item ${it.id}: duplicate action ids`);
    if (!it.consume) continue;
    Object.keys(it.consume.stats ?? {}).forEach((k) => ref("stat", k, `item ${it.id}.consume.stats`));
    checkOutcomes(it.consume.outcomes, `item ${it.id}.consume`);
  }
  for (const t of timers.values()) {
    if (t.region) ref("region", t.region, `timer ${t.id}`);
    if (t.building) ref("building", t.building, `timer ${t.id}.building`);
  }
  ref("region", game.start.region, "game.start.region");
  Object.keys(game.start.stats).forEach((k) => ref("stat", k, "game.start.stats"));
  Object.keys(game.start.items).forEach((k) => ref("item", k, "game.start.items"));
  ref("band", climate.startBand, "climate.startBand");
  stats.stats.forEach((s) => { if (!(s.id in game.start.stats)) problems.push(`game.start.stats: missing start value for "${s.id}"`); });
  checkCond(game.provisions.preparation.when, "game.provisions.preparation.when");
  ref("building", game.sleep.bed, "game.sleep.bed");
  ref("building", game.sleep.shelter, "game.sleep.shelter");
  ref("timer", game.sleep.fire, "game.sleep.fire");
  if (game.sleep.passOutHour >= game.sleep.wakeHour) problems.push("game.sleep.passOutHour must precede wakeHour");
  stats.multipliers.forEach((m, i) => { checkCond(m.when, `stats.multipliers[${i}]`); ref("stat", m.stat, `stats.multipliers[${i}]`); });
  stats.damage.forEach((d, i) => checkCond(d.when, `stats.damage[${i}]`));
  stats.regen.forEach((d, i) => checkCond(d.when, `stats.regen[${i}]`));
  for (const e of Object.keys(stats.ratesPerHour)) Object.keys(stats.ratesPerHour[e as keyof typeof stats.ratesPerHour] ?? {}).forEach((k) => ref("stat", k, `stats.ratesPerHour.${e}`));
  for (const q of quests.values()) {
    if (q.trigger === "manual" && !startedByEffect.has(q.id)) problems.push(`quest ${q.id}: trigger is "manual" but no { "startQuest": "${q.id}" } effect exists, so it can never start`);
  }
  // every action time is a whole number of clock steps (the clock moves in game.stepMinutes)
  const step = game.stepMinutes;
  const checkHours = (h: number, where: string) => {
    const minutes = h * 60;
    if (Math.abs(minutes / step - Math.round(minutes / step)) > 1e-9 || minutes < step) {
      problems.push(`${where}: ${h} h is not a whole number of ${step}-minute steps`);
    }
  };
  for (const { activity: a } of activities.values()) checkHours(a.hours, `activity ${a.id}.hours`);
  for (const r of regions.values()) r.explore?.landmarks.forEach((d) => checkHours(d.hours, `landmark ${d.id}.hours`));
  for (const it of items.values()) {
    if (it.consume) checkHours(it.consume.hours, `item ${it.id}.consume.hours`);
    it.actions?.forEach((a) => checkHours(a.hours, `item ${it.id}.actions.${a.id}.hours`));
  }
  for (const r of recipes.values()) r.ways.forEach((a, i) => checkHours(a.hours, `recipe ${r.id}.ways[${i}].hours`));
  for (const r of regions.values()) if (r.travelHours > 0) checkHours(r.travelHours, `region ${r.id}.travelHours`);
  for (const b of buildings.values()) {
    checkHours(b.build.hours, `building ${b.id}.build.hours`);
    if (!b.cycle) continue;
    checkHours(b.cycle.hours, `building ${b.id}.cycle.hours`);
    for (const step of [b.cycle.start, b.cycle.collect]) checkHours(step.hours, `building ${b.id}.cycle.${step.id}.hours`);
  }

  if (!statIds.has("health")) problems.push(`stats.json: a "health" stat is required (death happens at health 0)`);

  if (problems.length) throw new ContentError(problems);

  const regionOrder = [...regions.values()]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.id.localeCompare(b.id))
    .map((r) => r.id);

  let textKeys: Map<object, string>;
  try {
    textKeys = indexTextKeys({ game, stats, climate, items: [...items.values()], regions: [...regions.values()],
      recipes: [...recipes.values()], buildings: [...buildings.values()], quests: [...quests.values()], events: [...events.values()] });
  } catch (error) { throw new ContentError([String(error)]); }

  return Object.freeze({
    textKeys, game, stats, climate, items, regions, regionOrder, timers, activities, quests, events, buildings, recipes, buildingSteps, tags, discoveries, statIds, bandIds, phaseIds,
  });
}


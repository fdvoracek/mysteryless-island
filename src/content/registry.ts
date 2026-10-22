import { z } from "zod";
import { indexTextKeys } from "./text-keys";
import {
  Activity, Artwork, CreationTree, Site, type TreeKind, Building, Climate, Condition, Effect, Game, GameEvent, Item, Outcome, Quest, Recipe, Region, StatsFile,
  type BuildingStep, type Timer,
} from "./schema";

/** Frozen, indexed content. Systems read content only through this object. */
export interface Registry {
  textKeys: Map<object, string>;
  sites: Map<string, Site>;
  artwork: Map<string, Artwork>;
  trees: Map<TreeKind, TreeIndex>;
  game: Game;
  stats: StatsFile;
  climate: Climate;
  items: Map<string, Item>;
  regions: Map<string, Region>;
  regionOrder: string[];
  timers: Map<string, Timer>;
  activities: Map<string, { activity: Activity; regions: string[] }>;
  /** in (order, id) order; the tasks panel lists active quests in this order */
  quests: Map<string, Quest>;
  /** in (order, id) order (content/events/*.json) */
  events: Map<string, GameEvent>;
  /** content/buildings/*.json, in (order, id) order (the buildings panel lists them in this order) */
  buildings: Map<string, Building>;
  /** content/recipes/*.json, in id order; creation order belongs to the crafting tree */
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

export interface TreeIndex {
  definition: CreationTree;
  nodes: Map<string, CreationTree["nodes"][number]>;
  children: Map<string, string[]>;
  depth: Map<string, number>;
  order: string[];
}

export interface ContentProblem { file: string; path: string; message: string }

export class ContentError extends Error {
  public problems: string[];
  constructor(public diagnostics: ContentProblem[]) {
    const problems = diagnostics.map(({ message }) => message);
    super(`content has ${problems.length} problem(s):\n` + problems.join("\n"));
    this.problems = problems;
  }
}

/** Raw JSON position plus the unchanged human-readable validator location. */
class Source {
  constructor(readonly file: string, readonly path: string, readonly legacy: string) {}
  field(path: string, legacy: string | null = path): Source {
    return new Source(this.file, [this.path, path].filter(Boolean).join("."), legacy === null ? this.legacy : `${this.legacy}.${legacy}`);
  }
  toString() { return this.legacy; }
}
const compareIds = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

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

/**
 * Build the registry from a map of { "path/to/file.json": parsedJson }.
 * Paths decide the kind: game.json, stats.json, climate.json, items/*.json, regions/*.json.
 */
export function buildRegistry(files: Record<string, unknown>): Registry {
  const problems: ContentProblem[] = [];
  const problem = (source: Source, message: string) => { problems.push({ file: source.file, path: source.path, message }); };
  const sources = new WeakMap<object, { file: string; path: string }>();
  // Parse preserves array order; comments are object keys, so these are also raw-file positions.
  const indexSources = (value: unknown, file: string, path = ""): void => {
    if (!value || typeof value !== "object") return;
    sources.set(value, { file, path });
    for (const [key, child] of Object.entries(value)) indexSources(child, file, [path, key].filter(Boolean).join("."));
  };
  const at = (value: object, legacy: string | Source): Source => {
    const source = sources.get(value)!;
    return new Source(source.file, source.path, String(legacy));
  };
  const parse = <T>(schema: z.ZodType<T>, data: unknown, file: string): T | undefined => {
    const result = schema.safeParse(stripComments(data));
    if (result.success) { indexSources(result.data, file); return result.data; }
    for (const issue of result.error.issues) {
      problem(new Source(file, issue.path.join("."), file), `${file}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    return undefined;
  };
  const find = (suffix: string) => Object.keys(files).find((p) => p.endsWith(suffix));

  const need = (suffix: string) => {
    const p = find(suffix);
    if (!p) problem(new Source(suffix, "", suffix), `missing content file: ${suffix}`);
    return p;
  };
  const gamePath = need("content/game.json");
  const statsPath = need("content/stats.json");
  const climatePath = need("content/climate.json");

  const game = gamePath ? parse(Game, files[gamePath], gamePath) : undefined;
  const stats = statsPath ? parse(StatsFile, files[statsPath], statsPath) : undefined;
  const climate = climatePath ? parse(Climate, files[climatePath], climatePath) : undefined;

  const artwork = new Map<string, Artwork>();
  const sites = new Map<string, Site>();
  const treeDefs: Array<{ def: CreationTree; path: string }> = [];
  const trees = new Map<TreeKind, TreeIndex>();
  const items = new Map<string, Item>();
  const regions = new Map<string, Region>();
  const activities = new Map<string, { activity: Activity; regions: string[] }>();
  const quests = new Map<string, Quest>();
  const events = new Map<string, GameEvent>();
  const buildings = new Map<string, Building>();
  const recipes = new Map<string, Recipe>();
  const buildingSteps = new Map<string, { building: string; step: "start" | "collect"; def: BuildingStep }>();
  const discoveries = new Map<string, string>();
  const allIds = new Map<string, Source>(); // id -> definition source

  const claim = (id: string, where: Source) => {
    const prev = allIds.get(id);
    if (prev) problem(where, `duplicate id "${id}" in ${where} (already defined in ${prev})`);
    else allIds.set(id, where);
  };

  const entity = <T extends { id: string }>(schema: z.ZodType<T>, data: unknown, path: string): T | undefined => {
    const value = parse(schema, data, path);
    if (value && path.slice(path.lastIndexOf("/") + 1, -5) !== value.id) {
      problem(at(value, path).field("id", null), `${path}: id: file name must equal id "${value.id}"`);
    }
    if (value) claim(value.id, at(value, path).field("id", null));
    return value;
  };

  for (const [path, data] of Object.entries(files).sort(([a], [b]) => compareIds(a, b))) {
    if (/content\/artwork\/[^/]+\.json$/.test(path)) {
      const art = entity(Artwork, data, path);
      if (art) artwork.set(art.id, art);
    } else if (/content\/sites\/[^/]+\.json$/.test(path)) {
      const site = entity(Site, data, path);
      if (site) sites.set(site.id, site);
    } else if (/content\/trees\/[^/]+\.json$/.test(path)) {
      const def = parse(CreationTree, data, path);
      if (def) { claim(def.id, at(def, path).field("id", null)); treeDefs.push({ def, path }); }
    } else if (/content\/items\/[^/]+\.json$/.test(path)) {
      const item = entity(Item, data, path);
      if (item) items.set(item.id, item);
    } else if (/content\/activities\/[^/]+\.json$/.test(path)) {
      const activity = entity(Activity, data, path);
      if (activity) activities.set(activity.id, { activity, regions: [] });
    } else if (/content\/regions\/[^/]+\.json$/.test(path)) {
      const region = entity(Region, data, path);
      if (!region) continue;
      regions.set(region.id, region);
      for (const d of region.explore?.landmarks ?? []) { claim(d.id, at(d, path).field("id", null)); discoveries.set(d.id, region.id); }
    } else if (/content\/quests\/[^/]+\.json$/.test(path)) {
      const q = entity(Quest, data, path);
      if (q) quests.set(q.id, q);
    } else if (/content\/events\/[^/]+\.json$/.test(path)) {
      const ev = entity(GameEvent, data, path);
      if (ev) events.set(ev.id, ev);
    } else if (/content\/recipes\/[^/]+\.json$/.test(path)) {
      const r = entity(Recipe, data, path);
      if (r) recipes.set(r.id, r);
    } else if (/content\/buildings\/[^/]+\.json$/.test(path)) {
      const b = entity(Building, data, path);
      if (!b) continue;
      buildings.set(b.id, b);
      if (b.cycle) {
        for (const step of ["start", "collect"] as const) {
          claim(b.cycle[step].id, at(b.cycle[step], path).field("id", null));
          buildingSteps.set(b.cycle[step].id, { building: b.id, step, def: b.cycle[step] });
        }
      }
    } else if (![gamePath, statsPath, climatePath].includes(path)) {
      problem(new Source(path, "", path), `${path}: unsupported content file; use <kind>/<id>.json with one entity per file`);
    }
  }

  // Preserve authored link order, including linked globals. Unlinked globals follow by ID.
  const orderedActivities = new Map<string, { activity: Activity; regions: string[] }>();
  for (const region of regions.values()) {
    const linked = new Set<string>();
    for (const [index, id] of region.activities.entries()) {
      const location = at(region, String(allIds.get(region.id))).field(`activities.${index}`);
      if (linked.has(id)) problem(location, `${allIds.get(region.id)}: activities.${index}: duplicate activity link "${id}"`);
      linked.add(id);
      const entry = activities.get(id);
      if (!entry) problem(at(region, String(allIds.get(region.id))).field(`activities.${index}`), `${allIds.get(region.id)}: activities.${index}: unknown activity "${id}"`);
      else {
        if (!entry.regions.includes(region.id)) entry.regions.push(region.id);
        orderedActivities.set(id, entry);
      }
    }
  }
  for (const [id, entry] of activities) {
    if (!entry.activity.global && !entry.regions.length) problem(at(entry.activity, String(allIds.get(id))), `${allIds.get(id)}: activity "${id}" is neither linked nor global`);
    orderedActivities.set(id, entry);
  }
  activities.clear();
  for (const [id, entry] of orderedActivities) activities.set(id, entry);

  // Runtime consumers keep reading registry order, independent of file enumeration.
  const sort = <T extends { id: string; order?: number }>(map: Map<string, T>) => {
    const entries = [...map.entries()].sort(([, a], [, b]) =>
      (a.order ?? Infinity) - (b.order ?? Infinity) || compareIds(a.id, b.id));
    map.clear();
    for (const [id, value] of entries) map.set(id, value);
  };
  sort(items);
  sort(quests);
  sort(events);
  sort(buildings);

  if (!game || !stats || !climate) throw new ContentError(problems);

  const timers = new Map<string, Timer>();
  for (const t of game.timers) { claim(t.id, at(t, "game.json timers").field("id", null)); timers.set(t.id, t); }

  const statIds = new Set(stats.stats.map((s) => s.id));
  const bandIds = climate.bodyBands.map((b) => b.id);
  const phaseIds = new Set(climate.phases.map((p) => p.id));
  const tags = new Set<string>();
  const tagSources = new Map<string, Source>();
  const addTags = (values: string[] | undefined, source: Source) => values?.forEach((tag, index) => {
    tags.add(tag);
    if (!tagSources.has(tag)) tagSources.set(tag, source.field(String(index), null));
  });
  for (const { activity } of activities.values()) addTags(activity.tags, at(activity, `activity ${activity.id}`).field("tags"));
  for (const { def } of buildingSteps.values()) addTags(def.tags, at(def, String(allIds.get(def.id))).field("tags"));
  for (const r of recipes.values()) addTags(r.tags, at(r, `recipe ${r.id}`).field("tags"));
  for (const it of items.values()) {
    addTags(it.consume?.tags, at(it, `item ${it.id}`).field("consume.tags"));
    it.actions?.forEach((a) => addTags(a.tags, at(a, `item ${it.id}.actions.${a.id}`).field("tags")));
  }
  for (const t of tags) if (allIds.has(t)) problem(tagSources.get(t)!, `tag "${t}" has the same name as an id (${allIds.get(t)}); { "did": "${t}" } would be ambiguous`);
  const startedByEffect = new Set<string>();

  // Artwork belongs to presentation, never runtime save state or narrative identity.
  const checkArtwork = (entity: { id: string; artwork?: string }, region = false) => {
    if (!entity.artwork) return;
    const where = at(entity, `${allIds.get(entity.id)}.${entity.id}.artwork`).field("artwork", null);
    const art = artwork.get(entity.artwork);
    if (!art) problem(where, `${where}: unknown artwork "${entity.artwork}"`);
    else if (region && (art.width !== 1600 || art.height !== 440)) problem(where, `${where}: region artwork must declare 1600 × 440 pixels`);
  };
  for (const entity of regions.values()) checkArtwork(entity, true);
  for (const entity of items.values()) checkArtwork(entity);
  for (const entity of buildings.values()) checkArtwork(entity);
  if (game?.panorama && !artwork.has(game.panorama)) problem(at(game, String(gamePath)).field("panorama"), `${gamePath}.panorama: unknown artwork "${game.panorama}"`);

  // ---------- reference checks ----------
  const ref = (kind: "item" | "region" | "timer" | "stat" | "band" | "phase" | "quest" | "did" | "discovery" | "today" | "building" | "recipe", id: string, where: Source) => {
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
    if (!ok) problem(where, `${where}: unknown ${kind} "${id}"`);
  };

  const checkCond = (c: Condition, where: Source): void => {
    if ("all" in c) c.all.forEach((x, i) => checkCond(x, where.field(`all.${i}`, null)));
    else if ("any" in c) c.any.forEach((x, i) => checkCond(x, where.field(`any.${i}`, null)));
    else if ("not" in c) checkCond(c.not, where.field("not", null));
    else if ("item" in c) ref("item", c.item, where.field("item", null));
    else if ("seen" in c) ref("item", c.seen, where.field("seen", null));
    else if ("timer" in c) ref("timer", c.timer, where.field("timer", null));
    else if ("at" in c) ref("region", c.at, where.field("at", null));
    else if ("region" in c) ref("region", c.region, where.field("region", null));
    else if ("stat" in c) ref("stat", c.stat, where.field("stat", null));
    else if ("warmth" in c) c.warmth.forEach((b, i) => ref("band", b, where.field(`warmth.${i}`, null)));
    else if ("phase" in c) c.phase.forEach((p, i) => ref("phase", p, where.field(`phase.${i}`, null)));
    else if ("did" in c) ref("did", c.did, where.field("did", null));
    else if ("today" in c) ref("today", c.today, where.field("today", null));
    else if ("quest" in c) ref("quest", c.quest, where.field("quest", null));
    else if ("discovered" in c) ref("discovery", c.discovered, where.field("discovered", null));
    else if ("explored" in c) ref("region", c.explored, where.field("explored", null));
    else if ("site" in c) { if (!sites.has(c.site)) problem(where.field("site", null), `${where}: unknown site "${c.site}"`); }
    else if ("tool" in c) { if (!(c.tool in game.tools)) problem(where.field("tool", null), `${where}: unknown tool tag "${c.tool}"`); }
    else if ("built" in c) ref("building", c.built, where.field("built", null));
    else if ("sheltered" in c) { /* local shelter is defined by region content and game.sleep.shelter */ }
    else if ("building" in c) {
      ref("building", c.building, where.field("building", null));
      if (buildings.has(c.building) && !buildings.get(c.building)!.cycle) problem(where.field("building", null), `${where}: building "${c.building}" has no cycle, so it is never ${c.is}`);
    }
  };
  const usesShelter = (c: Condition): boolean => "sheltered" in c
    || ("all" in c && c.all.some(usesShelter)) || ("any" in c && c.any.some(usesShelter))
    || ("not" in c && usesShelter(c.not));
  const checkOutcomes = (os: Outcome[] | undefined, where: Source, rawField = "outcomes") =>
    os?.forEach((o, i) => {
      if (o.when) checkCond(o.when, where.field(`${rawField}.${i}.when`, `outcomes[${i}].when`));
      checkEffects(o.effects, where.field(`${rawField}.${i}`, `outcomes[${i}]`));
    });
  const checkEffects = (es: Effect[] | undefined, where: Source): void =>
    es?.forEach((e, i) => {
      const w = where.field(`effects.${i}`, `effects[${i}]`);
      if ("give" in e) Object.keys(e.give).forEach((k) => ref("item", k, w.field(`give.${k}`, null)));
      else if ("take" in e) Object.keys(e.take).forEach((k) => ref("item", k, w.field(`take.${k}`, null)));
      else if ("stat" in e) Object.keys(e.stat).forEach((k) => ref("stat", k, w.field(`stat.${k}`, null)));
      else if ("timer" in e) ref("timer", e.timer, w.field("timer", null));
      else if ("roll" in e) checkOutcomes(e.roll, w, "roll");
      else if ("startQuest" in e) { ref("quest", e.startQuest, w.field("startQuest", null)); startedByEffect.add(e.startQuest); }
      else if ("unlock" in e) ref("region", e.unlock, w.field("unlock", null));
      else if ("build" in e) ref("building", e.build, w.field("build", null));
      else if ("startCycle" in e) {
        ref("building", e.startCycle, w.field("startCycle", null));
        if (e.production && !buildings.get(e.startCycle)?.cycle?.products?.[e.production]) problem(w.field("production", null), `${w}: unknown production "${e.production}" for building "${e.startCycle}"`);
        if (buildings.has(e.startCycle) && !buildings.get(e.startCycle)!.cycle) problem(w.field("startCycle", null), `${w}: building "${e.startCycle}" has no cycle to start`);
      }
    });

  // The same work vocabulary is used by activities, recipes, item actions and building steps.
  const checkWork = (a: { visibleWhen?: Condition; requires?: Condition; cost?: Record<string, number>; effects?: Effect[] }, w: Source) => {
    if (a.visibleWhen) checkCond(a.visibleWhen, w.field(`visibleWhen`));
    if (a.requires) checkCond(a.requires, w.field(`requires`));
    Object.keys(a.cost ?? {}).forEach((k) => ref("item", k, w.field(`cost`).field(k, null)));
    checkEffects(a.effects, w);
  };

  for (const q of quests.values()) {
    const w = at(q, `quest ${q.id}`);
    if (typeof q.trigger === "object") checkCond(q.trigger.when, w.field(`trigger.when`));
    checkCond(q.completeWhen, w.field(`completeWhen`));
    checkEffects(q.effects, w);
  }
  for (const r of recipes.values()) {
    const w = at(r, `recipe ${r.id}`);
    ref("item", r.item, w.field(`item`));
    if (r.requires) checkCond(r.requires, w.field(`requires`));
    if (!r.multiple && (r.count ?? 1) !== 1) problem(w.field("count"), `${w}.count: non-repeatable recipe must output one item`);
    r.ways.forEach((a, i) => {
      const aw = w.field(`ways.${i}`, `ways[${i}]`);
      checkWork(a, aw);
    });
  }
  for (const ev of events.values()) {
    const w = at(ev, `event ${ev.id}`);
    if (!ev.scenes.start) problem(w.field("scenes.start"), `${w}: needs a scene called "start"`);
    if (ev.when) checkCond(ev.when, w.field(`when`));
    const t = ev.trigger;
    if (typeof t === "object" && "when" in t) checkCond(t.when, w.field(`trigger.when`));
    if (typeof t === "object" && "after" in t) {
      for (const [index, a] of (t.after ?? []).entries()) {
        const ok = a === "explore" || a === "travel" || activities.has(a) || tags.has(a) || items.has(a) || quests.has(a) || discoveries.has(a) || buildingSteps.has(a) || buildings.has(a) || recipes.has(a);
        if (!ok) problem(w.field(`trigger.after.${index}`), `${w}.trigger.after: unknown action "${a}" (use an activity id, a tag, an item id, "explore" or "travel")`);
      }
    }
    for (const [sid, sc] of Object.entries(ev.scenes)) {
      const sw = at(sc, w.field(`scenes.${sid}`));
      checkEffects(sc.effects, sw);
      const ids = new Set<string>();
      sc.choices?.forEach((c, i) => {
        const cw = at(c, sw.field(`choices.${i}`, `choices[${i}]`));
        if (ids.has(c.id)) problem(cw.field("id"), `${cw}: duplicate choice id "${c.id}"`);
        ids.add(c.id);
        if (c.visibleWhen) checkCond(c.visibleWhen, cw.field(`visibleWhen`));
        if (c.requires) checkCond(c.requires, cw.field(`requires`));
        checkEffects(c.effects, cw);
        if (c.next && !ev.scenes[c.next]) problem(cw.field("next"), `${cw}.next: unknown scene "${c.next}"`);
      });
    }
  }
  for (const r of regions.values()) {
    if (r.shelterWhen) {
      checkCond(r.shelterWhen, at(r, `region ${r.id}`).field(`shelterWhen`));
      if (usesShelter(r.shelterWhen)) problem(at(r, `region ${r.id}`).field("shelterWhen"), `region ${r.id}.shelterWhen cannot depend on sheltered`);
    }
    if (r.unlockWhen) checkCond(r.unlockWhen, at(r, `region ${r.id}`).field(`unlockWhen`));
    if (r.hintWhen) checkCond(r.hintWhen, at(r, `region ${r.id}`).field(`hintWhen`));
    r.arrive?.forEach((a, i) => { if (a.when) checkCond(a.when, at(r, `region ${r.id}`).field(`arrive.${i}.when`, `arrive[${i}].when`)); });
    r.explore?.view.forEach((v, i) => { if (v.when) checkCond(v.when, at(r, `region ${r.id}`).field(`explore.view.${i}.when`, `explore.view[${i}].when`)); });
    for (const d of r.explore?.landmarks ?? []) {
      const w = at(d, `landmark ${d.id}`);
      if (d.visibleWhen) checkCond(d.visibleWhen, w.field(`visibleWhen`));
      if (d.requires) checkCond(d.requires, w.field(`requires`));
      checkEffects(d.effects, w);
    }
  }
  for (const { activity: a } of activities.values()) {
    const w = at(a, `activity ${a.id}`);
    if (a.building) ref("building", a.building, w.field(`building`));
    checkWork(a, w);
    a.yields?.forEach((y, i) => { ref("item", y.item, w.field(`yields.${i}`, `yields[${i}]`).field("item", null)); if (y.when) checkCond(y.when, w.field(`yields.${i}.when`, `yields[${i}].when`)); });
    checkOutcomes(a.outcomes, w);
    for (const field of ["thoughts", "afterwards"] as const) {
      a[field]?.forEach((g, gi) => g.lines.forEach((l, li) => { if (l.when) checkCond(l.when, w.field(`${field}.${gi}.lines.${li}.when`, `${field}[${gi}].lines[${li}].when`)); }));
    }
  }
  for (const b of buildings.values()) {
    if (b.timer) ref("timer", b.timer, at(b, `building ${b.id}`).field(`timer`));
    const w = at(b, `building ${b.id}`);

    checkWork(b.build, w.field(`build`));
    for (const [id, yields] of Object.entries(b.cycle?.products ?? {})) {
      yields.forEach((y, i) => {
        const yw = w.field(`cycle.products.${id}.${i}`, `cycle.products.${id}[${i}]`);
        ref("item", y.item, yw.field("item", null));
        if (y.when) checkCond(y.when, yw.field(`when`));
      });
    }
    for (const step of b.cycle ? [b.cycle.start, b.cycle.collect] : []) {
      const sw = at(step, w.field(`cycle.${step.id}`));
      checkWork(step, sw);
      step.yields?.forEach((y, i) => { ref("item", y.item, sw.field(`yields.${i}`, `yields[${i}]`).field("item", null)); if (y.when) checkCond(y.when, sw.field(`yields.${i}.when`, `yields[${i}].when`)); });
      checkOutcomes(step.outcomes, sw);
    }
  }
  for (const it of items.values()) {
    for (const [index, t] of (it.tool?.tags ?? []).entries()) if (!(t in game.tools)) problem(at(it, `item ${it.id}`).field(`tool.tags.${index}`), `item ${it.id}.tool: unknown tool tag "${t}" (add it to game.json → tools)`);
    for (const a of it.actions ?? []) {
      const w = at(a, at(it, `item ${it.id}`).field(`actions.${a.id}`));
      if (a.building) ref("building", a.building, w.field(`building`));
      checkWork(a, w);
    }
    if (new Set((it.actions ?? []).map((a) => a.id)).size !== (it.actions ?? []).length) problem(at(it, `item ${it.id}`).field("actions"), `item ${it.id}: duplicate action ids`);
    if (!it.consume) continue;
    Object.keys(it.consume.stats ?? {}).forEach((k) => ref("stat", k, at(it, `item ${it.id}`).field(`consume.stats`).field(k, null)));
    checkOutcomes(it.consume.outcomes, at(it, `item ${it.id}`).field(`consume`));
  }
  for (const t of timers.values()) {
    if (t.region) ref("region", t.region, at(t, `timer ${t.id}`).field("region", null));
    if (t.building) ref("building", t.building, at(t, `timer ${t.id}`).field("building"));
  }
  ref("region", game.start.region, at(game, "game").field(`start.region`));
  Object.keys(game.start.stats).forEach((k) => ref("stat", k, at(game, "game").field(`start.stats`).field(k, null)));
  Object.keys(game.start.items).forEach((k) => ref("item", k, at(game, "game").field(`start.items`).field(k, null)));
  ref("band", climate.startBand, at(climate, "climate").field(`startBand`));
  stats.stats.forEach((s) => { if (!(s.id in game.start.stats)) problem(at(game, "game").field(`start.stats.${s.id}`), `game.start.stats: missing start value for "${s.id}"`); });
  checkCond(game.provisions.preparation.when, at(game, "game").field(`provisions.preparation.when`));
  ref("building", game.sleep.bed, at(game, "game").field(`sleep.bed`));
  ref("building", game.sleep.shelter, at(game, "game").field(`sleep.shelter`));
  ref("timer", game.sleep.fire, at(game, "game").field(`sleep.fire`));
  if (game.sleep.passOutHour >= game.sleep.wakeHour) problem(at(game, "game").field("sleep.passOutHour"), "game.sleep.passOutHour must precede wakeHour");
  stats.multipliers.forEach((m, i) => { checkCond(m.when, at(stats, "stats").field(`multipliers.${i}`, `multipliers[${i}]`).field("when", null)); ref("stat", m.stat, at(stats, "stats").field(`multipliers.${i}`, `multipliers[${i}]`).field("stat", null)); });
  stats.damage.forEach((d, i) => checkCond(d.when, at(stats, "stats").field(`damage.${i}`, `damage[${i}]`).field("when", null)));
  stats.regen.forEach((d, i) => checkCond(d.when, at(stats, "stats").field(`regen.${i}`, `regen[${i}]`).field("when", null)));
  for (const e of Object.keys(stats.ratesPerHour)) Object.keys(stats.ratesPerHour[e as keyof typeof stats.ratesPerHour] ?? {}).forEach((k) => ref("stat", k, at(stats, "stats").field(`ratesPerHour.${e}`).field(k, null)));
  for (const q of quests.values()) {
    if (q.trigger === "manual" && !startedByEffect.has(q.id)) problem(at(q, `quest ${q.id}`).field("trigger"), `quest ${q.id}: trigger is "manual" but no { "startQuest": "${q.id}" } effect exists, so it can never start`);
  }
  // every action time is a whole number of clock steps (the clock moves in game.stepMinutes)
  const step = game.stepMinutes;
  const checkHours = (h: number, where: Source) => {
    const minutes = h * 60;
    if (Math.abs(minutes / step - Math.round(minutes / step)) > 1e-9 || minutes < step) {
      problem(where, `${where}: ${h} h is not a whole number of ${step}-minute steps`);
    }
  };
  for (const { activity: a } of activities.values()) checkHours(a.hours, at(a, `activity ${a.id}`).field(`hours`));
  for (const r of regions.values()) r.explore?.landmarks.forEach((d) => checkHours(d.hours, at(d, `landmark ${d.id}`).field(`hours`)));
  for (const it of items.values()) {
    if (it.consume) checkHours(it.consume.hours, at(it, `item ${it.id}`).field(`consume.hours`));
    it.actions?.forEach((a) => checkHours(a.hours, at(a, `item ${it.id}.actions.${a.id}`).field("hours")));
  }
  for (const r of recipes.values()) r.ways.forEach((a, i) => checkHours(a.hours, at(r, `recipe ${r.id}`).field(`ways.${i}.hours`, `ways[${i}].hours`)));
  for (const r of regions.values()) if (r.travelHours > 0) checkHours(r.travelHours, at(r, `region ${r.id}`).field(`travelHours`));
  for (const b of buildings.values()) {
    checkHours(b.build.hours, at(b, `building ${b.id}`).field(`build.hours`));
    if (!b.cycle) continue;
    checkHours(b.cycle.hours, at(b, `building ${b.id}`).field(`cycle.hours`));
    for (const step of [b.cycle.start, b.cycle.collect]) checkHours(step.hours, at(step, `building ${b.id}.cycle.${step.id}`).field("hours"));
  }

  if (!statIds.has("health")) problem(at(stats, "stats.json").field("stats"), `stats.json: a "health" stat is required (death happens at health 0)`);

  const providers = new Set<string>();
  for (const region of regions.values()) {
    for (const [where, ids] of [[at(region, `region ${region.id}`).field(`siteCapabilities`), region.siteCapabilities],
      ...(region.explore?.landmarks ?? []).map((d) => [at(d, `landmark ${d.id}`).field(`siteCapabilities`), d.siteCapabilities] as const)] as const) {
      for (const [index, id] of (ids ?? []).entries()) {
        if (!sites.has(id)) problem(where.field(String(index), null), `${where}: unknown site "${id}"`);
        providers.add(id);
      }
    }
  }
  const checkCreation = (c: Condition | undefined, where: Source): void => {
    if (!c) return;
    if ("quest" in c) problem(where.field("quest", null), `${where}: quests cannot gate creation`);
    if ("site" in c && !providers.has(c.site)) problem(where.field("site", null), `${where}: site "${c.site}" has no provider`);
    if ("all" in c) c.all.forEach((x, i) => checkCreation(x, where.field(`all.${i}`, `all[${i}]`)));
    if ("any" in c) c.any.forEach((x, i) => checkCreation(x, where.field(`any.${i}`, `any[${i}]`)));
    if ("not" in c) checkCreation(c.not, where.field(`not`));
  };
  for (const r of recipes.values()) {
    checkCreation(r.requires, at(r, `recipe ${r.id}`).field(`requires`));
    r.ways.forEach((w, i) => { checkCreation(w.requires, at(r, `recipe ${r.id}`).field(`ways.${i}.requires`, `ways[${i}].requires`)); checkCreation(w.visibleWhen, at(r, `recipe ${r.id}`).field(`ways.${i}.visibleWhen`, `ways[${i}].visibleWhen`)); });
  }
  for (const b of buildings.values()) checkCreation(b.build.requires, at(b, `building ${b.id}`).field(`build.requires`));
  for (const { def, path } of treeDefs) {
    if (trees.has(def.kind)) problem(at(def, path).field("kind"), `${path}.kind: duplicate tree kind "${def.kind}"`);
    const branches = new Set<string>();
    for (const branch of def.branches) { claim(branch.id, at(branch, `${path}.branches`).field("id", null)); branches.add(branch.id); }
    const nodes = new Map<string, CreationTree["nodes"][number]>();
    const children = new Map<string, string[]>();
    for (const [i, node] of def.nodes.entries()) {
      const where = at(node, `${path}.nodes[${i}]`);
      if (nodes.has(node.target)) problem(where.field("target"), `${where}.target: duplicate target "${node.target}"`);
      ref(def.kind === "craft" ? "recipe" : "building", node.target, where.field(`target`));
      if (!branches.has(node.branch)) problem(where.field("branch"), `${where}.branch: unknown branch "${node.branch}"`);
      if (new Set(node.after).size !== node.after.length) problem(where.field("after"), `${where}.after: duplicate parents`);
      nodes.set(node.target, node);
    }
    const depth = new Map<string, number>();
    const order: string[] = [];
    const visit = (id: string, stack: string[]): number => {
      if (depth.has(id)) return depth.get(id)!;
      if (stack.includes(id)) { const from = nodes.get(stack.at(-1)!)!; problem(at(from, path).field(`after.${from.after.indexOf(id)}`), `${path}.nodes.after: cycle ${[...stack, id].join(" → ")}`); return 0; }
      const node = nodes.get(id);
      if (!node) return 0;
      let value = 0;
      for (const [index, parent] of node.after.entries()) {
        if (!nodes.has(parent)) { problem(at(node, path).field(`after.${index}`), `${path}.nodes.${id}.after: unknown parent "${parent}" in this tree`); continue; }
        value = Math.max(value, visit(parent, [...stack, id]) + 1);
      }
      depth.set(id, value); order.push(id); return value;
    };
    for (const node of nodes.values()) {
      visit(node.target, []);
      for (const parent of node.after) children.set(parent, [...children.get(parent) ?? [], node.target]);
    }
    trees.set(def.kind, { definition: def, nodes, children, depth, order });
  }
  for (const kind of ["craft", "build"] as const) {
    const tree = trees.get(kind);
    if (!tree) problem(new Source(`content/trees/${kind === "craft" ? "crafting" : "building"}.json`, "", "content/trees"), `content/trees: missing ${kind} tree`);
    for (const id of (kind === "craft" ? recipes : buildings).keys()) {
      if (!tree?.nodes.has(id)) problem(at((kind === "craft" ? recipes.get(id) : buildings.get(id))!, "content/trees"), `content/trees: ${kind} target "${id}" needs exactly one node`);
    }
  }

  if (problems.length) throw new ContentError(problems);

  const regionOrder = [...regions.values()]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || compareIds(a.id, b.id))
    .map((r) => r.id);

  let textKeys: Map<object, string>;
  textKeys = indexTextKeys({ game, stats, climate, items: [...items.values()], regions: [...regions.values()],
      activities: [...activities.values()].map(({ activity }) => activity),
      recipes: [...recipes.values()], buildings: [...buildings.values()], quests: [...quests.values()], events: [...events.values()] }, (value, id) => {
      problem(at(value, "text").field("id", null), `Error: duplicate text id "${id}"`);
      throw new ContentError(problems);
    });

  return Object.freeze({
    artwork, trees, sites, textKeys, game, stats, climate, items, regions, regionOrder, timers, activities, quests, events, buildings, recipes, buildingSteps, tags, discoveries, statIds, bandIds, phaseIds,
  });
}


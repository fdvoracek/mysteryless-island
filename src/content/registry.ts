import { z } from "zod";
import {
  Climate, Condition, Effect, Game, Item, Outcome, Quest, Region, StatsFile,
  type Activity, type Timer,
} from "./schema";

/** Frozen, indexed content. Systems read content only through this object. */
export interface Registry {
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
      for (const d of region.explore?.discoveries ?? []) { claim(d.id, path); discoveries.set(d.id, region.id); }
    } else if (/content\/quests\/[^/]+\.json$/.test(path)) {
      const list = parse(z.array(Quest), data, path, problems) ?? [];
      for (const q of list) { claim(q.id, path); quests.set(q.id, q); }
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
  for (const it of items.values()) {
    it.consume?.tags?.forEach((t) => tags.add(t));
    it.actions?.forEach((a) => a.tags?.forEach((t) => tags.add(t)));
  }
  for (const t of tags) if (allIds.has(t)) problems.push(`tag "${t}" has the same name as an id (${allIds.get(t)}); { "did": "${t}" } would be ambiguous`);
  const startedByEffect = new Set<string>();

  // ---------- reference checks ----------
  const ref = (kind: "item" | "region" | "timer" | "stat" | "band" | "phase" | "quest" | "did" | "discovery" | "today", id: string, where: string) => {
    const ok =
      kind === "item" ? items.has(id)
      : kind === "region" ? regions.has(id)
      : kind === "timer" ? timers.has(id)
      : kind === "stat" ? statIds.has(id)
      : kind === "band" ? bandIds.includes(id)
      : kind === "quest" ? quests.has(id)
      : kind === "discovery" ? discoveries.has(id)
      : kind === "did" ? activities.has(id) || items.has(id) || tags.has(id)
      : kind === "today" ? activities.has(id) || items.has(id) || tags.has(id) || discoveries.has(id) || regions.has(id) || quests.has(id)
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
  };
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
    });

  for (const q of quests.values()) {
    const w = `quest ${q.id}`;
    if (typeof q.trigger === "object") checkCond(q.trigger.when, `${w}.trigger.when`);
    checkCond(q.completeWhen, `${w}.completeWhen`);
    checkEffects(q.effects, w);
    if (q.action) {
      if (q.action.requires) checkCond(q.action.requires, `${w}.action.requires`);
      Object.keys(q.action.cost ?? {}).forEach((k) => ref("item", k, `${w}.action.cost`));
      checkEffects(q.action.effects, `${w}.action`);
    }
  }
  for (const r of regions.values()) {
    if (r.unlockWhen) checkCond(r.unlockWhen, `region ${r.id}.unlockWhen`);
    r.arrive?.forEach((a, i) => { if (a.when) checkCond(a.when, `region ${r.id}.arrive[${i}].when`); });
    if (r.explore) {
      if (r.explore.requires) checkCond(r.explore.requires, `region ${r.id}.explore.requires`);
      for (const d of r.explore.discoveries) {
        const w = `discovery ${d.id}`;
        if (d.when) checkCond(d.when, `${w}.when`);
        checkEffects(d.effects, w);
      }
    }
    for (const a of r.activities) {
      const w = `activity ${a.id}`;
      if (a.visibleWhen) checkCond(a.visibleWhen, `${w}.visibleWhen`);
      if (a.requires) checkCond(a.requires, `${w}.requires`);
      Object.keys(a.cost ?? {}).forEach((k) => ref("item", k, `${w}.cost`));
      a.yields?.forEach((y, i) => { ref("item", y.item, `${w}.yields[${i}]`); if (y.when) checkCond(y.when, `${w}.yields[${i}].when`); });
      checkOutcomes(a.outcomes, w);
      checkEffects(a.effects, w);
      for (const field of ["thoughts", "afterwards"] as const) {
        a[field]?.forEach((g, gi) => g.lines.forEach((l, li) => { if (l.when) checkCond(l.when, `${w}.${field}[${gi}].lines[${li}].when`); }));
      }
    }
  }
  for (const it of items.values()) {
    for (const a of it.actions ?? []) {
      const w = `item ${it.id}.actions.${a.id}`;
      if (a.visibleWhen) checkCond(a.visibleWhen, `${w}.visibleWhen`);
      if (a.requires) checkCond(a.requires, `${w}.requires`);
      Object.keys(a.cost ?? {}).forEach((k) => ref("item", k, `${w}.cost`));
      checkEffects(a.effects, w);
    }
    if (new Set((it.actions ?? []).map((a) => a.id)).size !== (it.actions ?? []).length) problems.push(`item ${it.id}: duplicate action ids`);
    if (!it.consume) continue;
    Object.keys(it.consume.stats ?? {}).forEach((k) => ref("stat", k, `item ${it.id}.consume.stats`));
    checkOutcomes(it.consume.outcomes, `item ${it.id}.consume`);
  }
  for (const t of timers.values()) if (t.region) ref("region", t.region, `timer ${t.id}`);
  ref("region", game.start.region, "game.start.region");
  Object.keys(game.start.stats).forEach((k) => ref("stat", k, "game.start.stats"));
  Object.keys(game.start.items).forEach((k) => ref("item", k, "game.start.items"));
  ref("band", climate.startBand, "climate.startBand");
  stats.stats.forEach((s) => { if (!(s.id in game.start.stats)) problems.push(`game.start.stats: missing start value for "${s.id}"`); });
  stats.multipliers.forEach((m, i) => { checkCond(m.when, `stats.multipliers[${i}]`); ref("stat", m.stat, `stats.multipliers[${i}]`); });
  stats.damage.forEach((d, i) => checkCond(d.when, `stats.damage[${i}]`));
  stats.regen.forEach((d, i) => checkCond(d.when, `stats.regen[${i}]`));
  for (const e of Object.keys(stats.ratesPerHour)) Object.keys(stats.ratesPerHour[e as keyof typeof stats.ratesPerHour] ?? {}).forEach((k) => ref("stat", k, `stats.ratesPerHour.${e}`));
  for (const q of quests.values()) {
    if (q.trigger === "manual" && !startedByEffect.has(q.id)) problems.push(`quest ${q.id}: trigger is "manual" but no { "startQuest": "${q.id}" } effect exists, so it can never start`);
  }
  if (!statIds.has("health")) problems.push(`stats.json: a "health" stat is required (death happens at health 0)`);

  if (problems.length) throw new ContentError(problems);

  const regionOrder = [...regions.values()]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.id.localeCompare(b.id))
    .map((r) => r.id);

  return Object.freeze({
    game, stats, climate, items, regions, regionOrder, timers, activities, quests, tags, discoveries, statIds, bandIds, phaseIds,
  });
}

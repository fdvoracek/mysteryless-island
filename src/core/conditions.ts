import type { Registry } from "../content/registry";
import type { Condition, Effort } from "../content/schema";
import { day, phaseAt } from "./clock";
import type { GameState } from "./state";
import { timerValue } from "./timers";

export interface Ctx {
  reg: Registry;
  state: GameState;
  /** effort of the action currently being simulated, if any */
  effort?: Effort;
}

const inRange = (v: number, c: { gte?: number; lte?: number }, defaultGte?: number) => {
  const gte = c.gte ?? (c.lte === undefined ? defaultGte : undefined);
  return (gte === undefined || v >= gte) && (c.lte === undefined || v <= c.lte);
};

/** The state key of a building in a place (one can stand in each of its places). */
export const buildingKey = (id: string, region: string) => `${id}@${region}`;

/** Batches a running cycle has ready now (0 while working), up to its `batches`. */
export function batchesReady(reg: Registry, s: GameState, id: string, region: string): number {
  const st = s.buildings?.[buildingKey(id, region)];
  const cycle = reg.buildings.get(id)?.cycle;
  if (!st || st.startedAt === undefined || !cycle) return 0;
  return Math.min(cycle.batches ?? 1, Math.floor((s.time - st.startedAt) / Math.round(cycle.hours * 60)));
}

/**
 * A building's cycle now: not built, idle, working (nothing to collect yet) or ready. `region`:
 * the one in that place; default the one where you are, else the first one built.
 */
export function buildingState(reg: Registry, s: GameState, id: string, region?: string): "none" | "idle" | "working" | "ready" {
  const where = region ?? (s.buildings?.[buildingKey(id, s.location)] ? s.location
    : Object.keys(s.buildings ?? {}).find((k) => k.startsWith(`${id}@`))?.slice(id.length + 1));
  const st = where ? s.buildings?.[buildingKey(id, where)] : undefined;
  if (!where || !st) return "none";
  if (st.startedAt === undefined) return "idle";
  return batchesReady(reg, s, id, where) > 0 ? "ready" : "working";
}

/** Items you have enough of to count as this tool (`tool.amount`), quickest first. */
export function toolsFor(reg: Registry, s: GameState, tag: string): Array<{ id: string; hoursFactor: number }> {
  const out: Array<{ id: string; hoursFactor: number }> = [];
  for (const it of reg.items.values()) {
    if (it.tool?.tags.includes(tag) && (s.items[it.id] ?? 0) >= (it.tool.amount ?? 1)) out.push({ id: it.id, hoursFactor: it.tool.hoursFactor ?? 1 });
  }
  return out.sort((a, b) => a.hoursFactor - b.hoursFactor);
}

/**
 * How much longer an action takes because of the tools you have: for each { "tool": tag } its
 * conditions ask for (not under `not`), the quickest item you have with that tag; the largest of
 * their `hoursFactor` (the rock knife, when it is the only sharp thing: 2). 1 when nothing slows it.
 */
export function toolFactor(reg: Registry, s: GameState, conds: Array<Condition | undefined>): number {
  let factor = 1;
  const walk = (c: Condition | undefined) => {
    if (!c) return;
    if ("all" in c) c.all.forEach(walk);
    else if ("any" in c) c.any.forEach(walk);
    else if ("tool" in c) {
      const best = toolsFor(reg, s, c.tool)[0];
      if (best) factor = Math.max(factor, best.hoursFactor);
    }
  };
  conds.forEach(walk);
  return factor;
}

/** Evaluate a structured condition against the state. */
export function evaluate(c: Condition | undefined, ctx: Ctx): boolean {
  if (!c) return true;
  const { state: s, reg } = ctx;
  if ("all" in c) return c.all.every((x) => evaluate(x, ctx));
  if ("any" in c) return c.any.some((x) => evaluate(x, ctx));
  if ("not" in c) return !evaluate(c.not, ctx);
  if ("item" in c) return inRange(s.items[c.item] ?? 0, c, 1);
  if ("tool" in c) return toolsFor(reg, s, c.tool).length > 0;
  if ("seen" in c) return s.seen.includes(c.seen);
  if ("flag" in c) return s.flags.includes(c.flag);
  // timer values are authored in hours; a bare { "timer": "fire" } means "running"
  if ("timer" in c) {
    const hours = timerValue(reg, s, c.timer) / 60;
    return c.gte === undefined && c.lte === undefined ? hours > 0 : inRange(hours, c);
  }
  if ("at" in c) return s.location === c.at;
  if ("region" in c) return !!s.regions[c.region]?.unlocked;
  if ("stat" in c) return inRange(s.stats[c.stat] ?? 0, c);
  if ("warmth" in c) return c.warmth.includes(reg.bandIds[s.warmth]);
  if ("phase" in c) return c.phase.includes(phaseAt(reg, s.time).id);
  if ("effort" in c) return !!ctx.effort && c.effort.includes(ctx.effort);
  if ("day" in c) return inRange(day(s.time), c.day);
  if ("did" in c) return inRange(s.counters[`did:${c.did}`] ?? 0, c, 1);
  if ("today" in c) return inRange(s.today?.[c.today] ?? 0, c, 1);
  if ("reached" in c) return s.time >= (c.reached.day - 1) * 1440 + Math.round((c.reached.hour ?? 0) * 60);
  if ("quest" in c) return s.quests[c.quest]?.status === c.is;
  if ("discovered" in c) {
    const region = reg.discoveries.get(c.discovered);
    return !!region && !!s.regions[region]?.discoveries.includes(c.discovered);
  }
  if ("explored" in c) return inRange(s.regions[c.explored]?.explored ?? 0, c, 1);
  if ("built" in c) return c.here
    ? (s.buildings?.[buildingKey(c.built, s.location)]?.count ?? 0) > 0
    : Object.keys(s.buildings ?? {}).some((k) => k.startsWith(`${c.built}@`));
  if ("sheltered" in c) {
    const natural = reg.regions.get(s.location)?.shelterWhen;
    const sheltered = (s.buildings?.[buildingKey(reg.game.sleep.shelter, s.location)]?.count ?? 0) > 0
      || (!!natural && evaluate(natural, ctx));
    return sheltered === c.sheltered;
  }
  if ("building" in c) return buildingState(reg, s, c.building) === c.is;
  return false;
}

/**
 * Explain the first unmet part of a condition as a short phrase, for tooltips.
 * Authors can override this per activity with "requiresText".
 */
export function explain(c: Condition | undefined, ctx: Ctx): string | null {
  if (!c || evaluate(c, ctx)) return null;
  const { reg } = ctx;
  if ("all" in c) {
    for (const x of c.all) { const e = explain(x, ctx); if (e) return e; }
    return null;
  }
  if ("any" in c) return c.any.map((x) => explain(x, ctx)).filter(Boolean).join(" or ") || "not possible now";
  if ("item" in c) {
    const name = reg.items.get(c.item)?.name ?? c.item;
    return c.lte !== undefined ? `too much ${name}` : `needs ${c.gte ?? 1} ${name}`;
  }
  // a tool: what it is for, not which item ("needs something sharp")
  if ("tool" in c) return `needs ${reg.game.tools[c.tool]?.needs ?? c.tool}`;
  if ("timer" in c) return `the ${reg.timers.get(c.timer)?.name ?? c.timer} is out`;
  if ("phase" in c) return `only at ${c.phase.join(", ")}`;
  if ("at" in c) return `only in ${reg.regions.get(c.at)?.name ?? c.at}`;
  if ("warmth" in c) return `only when ${c.warmth.join(" or ")}`;
  if ("reached" in c) return `not before day ${c.reached.day}`;
  if ("built" in c) return `needs the ${reg.buildings.get(c.built)?.name ?? c.built}`;
  if ("sheltered" in c) return c.sheltered ? "needs shelter here" : "already sheltered here";
  return "not possible now";
}

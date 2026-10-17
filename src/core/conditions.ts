import type { Registry } from "../content/registry";
import type { Condition, Effort } from "../content/schema";
import { day, phaseAt } from "./clock";
import type { GameState } from "./state";

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

/** Items you have that stand in for this one (see Item.substitutes), slowest last. */
export function substitutesFor(reg: Registry, s: GameState, id: string): Array<{ id: string; hoursFactor: number }> {
  const out: Array<{ id: string; hoursFactor: number }> = [];
  for (const it of reg.items.values()) {
    if (it.substitutes?.item === id && (s.items[it.id] ?? 0) > 0) out.push({ id: it.id, hoursFactor: it.substitutes.hoursFactor });
  }
  return out.sort((a, b) => a.hoursFactor - b.hoursFactor);
}

/**
 * How much longer an action takes because a tool it needs is only a stand-in: the largest
 * `hoursFactor` among the items its conditions ask for (not under `not`) that you don't have but
 * whose substitute you do. 1 when nothing is missing.
 */
export function toolFactor(reg: Registry, s: GameState, conds: Array<Condition | undefined>): number {
  let factor = 1;
  const walk = (c: Condition | undefined) => {
    if (!c) return;
    if ("all" in c) c.all.forEach(walk);
    else if ("any" in c) c.any.forEach(walk);
    else if ("item" in c && c.lte === undefined && !(s.items[c.item] ?? 0)) {
      const sub = substitutesFor(reg, s, c.item)[0];
      if (sub) factor = Math.max(factor, sub.hoursFactor);
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
  if ("item" in c) {
    // "you have one" is also met by an item that stands in for it (the rock knife for the knife)
    const have = s.items[c.item] ?? 0;
    if (!have && c.lte === undefined && (c.gte ?? 1) <= 1 && substitutesFor(reg, s, c.item).length) return true;
    return inRange(have, c, 1);
  }
  if ("seen" in c) return s.seen.includes(c.seen);
  if ("flag" in c) return s.flags.includes(c.flag);
  // timer values are authored in hours; a bare { "timer": "fire" } means "running"
  if ("timer" in c) {
    const hours = (s.timers[c.timer] ?? 0) / 60;
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
  if ("built" in c) return Object.keys(s.buildings ?? {}).some((k) => k.startsWith(`${c.built}@`));
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
    if (c.lte !== undefined) return `too much ${name}`;
    // a tool that something else can stand in for: say so (needs a knife or a rock knife)
    const subs = [...reg.items.values()].filter((it) => it.substitutes?.item === c.item).map((it) => it.name);
    if (subs.length && (c.gte ?? 1) <= 1) return `needs a ${[name, ...subs].join(" or a ")}`;
    return `needs ${c.gte ?? 1} ${name}`;
  }
  if ("timer" in c) return `the ${reg.timers.get(c.timer)?.name ?? c.timer} is out`;
  if ("phase" in c) return `only at ${c.phase.join(", ")}`;
  if ("at" in c) return `only in ${reg.regions.get(c.at)?.name ?? c.at}`;
  if ("warmth" in c) return `only when ${c.warmth.join(" or ")}`;
  if ("reached" in c) return `not before day ${c.reached.day}`;
  if ("built" in c) return `needs the ${reg.buildings.get(c.built)?.name ?? c.built}`;
  return "not possible now";
}

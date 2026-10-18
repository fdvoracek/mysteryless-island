import type { Condition, ItemAction } from "../content/schema";
import { evaluate, explain, toolFactor, type Ctx } from "./conditions";

export interface Requirements {
  visibleWhen?: Condition;
  requires?: Condition;
  requiresText?: string;
  cost?: Record<string, number>;
}

export interface Availability { visible: boolean; enabled: boolean; reason?: string }

/** Availability and execution must use the same resolved input quantities. */
export function itemActionCost(item: string, action: ItemAction): Record<string, number> {
  const cost = { ...action.cost };
  cost[item] = (cost[item] ?? 0) + (action.uses ?? 1);
  return cost;
}

export function checkRequirements(ctx: Ctx, def: Requirements, cost = def.cost): Availability {
  if (!evaluate(def.visibleWhen, ctx)) return { visible: false, enabled: false };
  if (!evaluate(def.requires, ctx)) {
    return { visible: true, enabled: false, reason: def.requiresText ?? explain(def.requires, ctx) ?? undefined };
  }
  for (const [item, n] of Object.entries(cost ?? {})) {
    const have = ctx.state.items[item] ?? 0;
    if (have < n) return { visible: true, enabled: false, reason: `needs ${n} ${ctx.reg.items.get(item)?.name ?? item} (have ${have})` };
  }
  return { visible: true, enabled: true };
}

/** Round tool-adjusted work up to a clock step, for both display and execution. */
export function workHours(ctx: Ctx, hours: number, conditions: Array<Condition | undefined>): number {
  const minutes = hours * 60 * toolFactor(ctx.reg, ctx.state, conditions);
  return Math.ceil((minutes - 1e-9) / ctx.reg.game.stepMinutes) * ctx.reg.game.stepMinutes / 60;
}

export function multiplyCost(cost: Record<string, number> | undefined, count: number): Record<string, number> {
  return Object.fromEntries(Object.entries(cost ?? {}).map(([id, n]) => [id, n * count]));
}

import type { Condition, ItemAction } from "../content/schema";
import { evaluate, evaluateTools, explain, toolFactor, type Ctx } from "./conditions";

export interface Requirements {
  visibleWhen?: Condition;
  requires?: Condition;
  requiresText?: string;
  cost?: Record<string, number>;
}

export interface RequirementEntry {
  kind: "condition" | "material" | "prerequisite" | "limit";
  label: string;
  met: boolean;
  required?: number;
  available?: number;
  operator?: "all" | "any" | "not";
  children?: RequirementEntry[];
}
export interface Availability { visible: boolean; enabled: boolean; reason?: string }

export function conditionEntry(condition: Condition, ctx: Ctx): RequirementEntry {
  if ("all" in condition || "any" in condition || "not" in condition) {
    const operator = "all" in condition ? "all" : "any" in condition ? "any" : "not";
    const children = ("all" in condition ? condition.all : "any" in condition ? condition.any : [condition.not]).map((c) => conditionEntry(c, ctx));
    return { kind: "condition", label: operator, met: evaluate(condition, ctx), operator, children };
  }
  const label = "tool" in condition ? `needs ${ctx.reg.game.tools[condition.tool]?.needs ?? condition.tool}`
    : "site" in condition ? `needs ${ctx.reg.sites.get(condition.site)?.needs ?? condition.site} here`
    : "item" in condition ? `needs ${condition.gte !== undefined ? `at least ${condition.gte}` : condition.lte === undefined ? "at least 1" : ""}${condition.lte !== undefined ? `${condition.gte !== undefined ? " and " : ""}at most ${condition.lte}` : ""} ${ctx.reg.items.get(condition.item)?.name ?? condition.item}`
    : "discovered" in condition ? `discover ${ctx.reg.regions.get(ctx.reg.discoveries.get(condition.discovered) ?? "")?.explore?.landmarks.find((d) => d.id === condition.discovered)?.label ?? condition.discovered}`
    : "sheltered" in condition ? condition.sheltered ? "needs shelter here" : "needs an unsheltered site"
    : "built" in condition ? `needs ${ctx.reg.buildings.get(condition.built)?.name ?? condition.built}`
    : explain(condition, ctx) ?? "requirement met";
  return { kind: "condition", label, met: evaluate(condition, ctx) };
}

export function requirementEntries(ctx: Ctx, def: Requirements, cost = def.cost): RequirementEntry[] {
  return [
    ...(def.requires ? [conditionEntry(def.requires, ctx)] : []),
    ...Object.entries(cost ?? {}).map(([item, required]): RequirementEntry => ({ kind: "material", label: ctx.reg.items.get(item)?.name ?? item,
      required, available: ctx.state.items[item] ?? 0, met: (ctx.state.items[item] ?? 0) >= required })),
  ];
}

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

export function toolRequirementEntry(predicate: import("./work").ToolPredicate, ctx: Ctx): RequirementEntry {
  if (typeof predicate === "boolean") return { kind: "condition", label: predicate ? "start requirement satisfied" : "alternative unavailable for this work", met: predicate };
  if ("tool" in predicate) return conditionEntry(predicate, ctx);
  const operator = "all" in predicate ? "all" : "any" in predicate ? "any" : "not";
  const children = ("all" in predicate ? predicate.all : "any" in predicate ? predicate.any : [predicate.not]).map((child) => toolRequirementEntry(child, ctx));
  return { kind: "condition", label: "required tools", operator, children, met: evaluateTools(predicate, ctx) };
}

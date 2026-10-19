import { z } from "zod";
import { CollectionSchema } from "./production";
import { Effort } from "../content/schema";
import type { Registry } from "../content/registry";

/** A resumable command references content; it never stores executable callbacks or future states. */
export const WorkSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("activity"), id: z.string() }),
  z.object({ kind: z.literal("craft"), recipe: z.string(), way: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("item"), item: z.string(), action: z.string() }),
  z.object({ kind: z.literal("consume"), item: z.string() }),
  z.object({ kind: z.literal("travel"), destination: z.string() }),
  z.object({ kind: z.literal("explore"), region: z.string(), landmark: z.string() }),
  z.object({ kind: z.literal("building"), id: z.string(), step: z.enum(["build", "start", "collect"]), units: z.number().int().positive(), collections: z.array(CollectionSchema).default([]) }),
]);
export type Work = z.infer<typeof WorkSchema>;
export const ActionSnapshotSchema = z.object({
  items: z.record(z.number()), unlocked: z.array(z.string()), location: z.string(), possible: z.array(z.string()), built: z.array(z.string()),
});
export type ActionSnapshot = z.infer<typeof ActionSnapshotSchema>;
export const PendingActionSchema = z.object({
  id: z.string(), owner: z.literal("player"), location: z.string(), label: z.string(), work: WorkSchema,
  requiredMinutes: z.number().finite().positive(), completedMinutes: z.number().finite().nonnegative(),
  effort: Effort, status: z.enum(["running", "paused"]),
  reserved: z.record(z.number().int().nonnegative()), eventKeys: z.array(z.string()),
  before: ActionSnapshotSchema, damageLogged: z.array(z.string()).default([]),
});
export type PendingAction = z.infer<typeof PendingActionSchema>;

/** One focus budget shared equally. A future perk can increase it without changing action code. */
export function focusShare(count: number, multiplier = 1): number {
  return count > 0 ? Math.min(1, Math.max(0, multiplier) / count) : 0;
}

export function workExists(reg: Registry, work: Work): boolean {
  switch (work.kind) {
    case "activity": return reg.activities.has(work.id);
    case "craft": return !!reg.recipes.get(work.recipe)?.ways[work.way];
    case "item": return !!reg.items.get(work.item)?.actions?.some((a) => a.id === work.action);
    case "consume": return !!reg.items.get(work.item)?.consume;
    case "travel": return reg.regions.has(work.destination);
    case "explore": return reg.regions.get(work.region)?.explore?.landmarks.some((d) => d.id === work.landmark) ?? false;
    case "building": return !!reg.buildings.get(work.id) && (work.step === "build" || !!reg.buildings.get(work.id)?.cycle);
  }
}

/** Stable presentation target for work whose original menu has already closed. */
export function workTarget(work: Work): { kind: "action" | "travel"; id: string } {
  switch (work.kind) {
    case "travel": return { kind: "travel", id: work.destination };
    case "craft": return { kind: "action", id: "menu:craft" };
    case "explore": return { kind: "action", id: `explore:${work.region}` };
    case "building": return { kind: "action", id: work.step === "build" ? "menu:build" : `building:${work.id}:${work.step}` };
    case "item": return { kind: "action", id: `item:${work.item}:${work.action}` };
    case "consume": return { kind: "action", id: `consume:${work.item}` };
    case "activity": return { kind: "action", id: work.id };
  }
}

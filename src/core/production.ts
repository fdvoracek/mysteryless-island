import { z } from "zod";
import type { Building } from "../content/schema";

const count = z.number().finite().int().nonnegative();
/** A local group of units with the same inputs, output and production clock. */
export const ProductionBatchSchema = z.object({
  id: count, units: count.positive(), startedAt: count,
  inputs: z.record(count).default({}), production: z.string().optional(),
});
export const BuildingStateSchema = z.object({
  count: count.positive().default(1), builtAt: count,
  batches: z.array(ProductionBatchSchema).default([]), nextBatch: count.default(1),
}).superRefine((st, ctx) => {
  if (st.batches.reduce((n, batch) => n + batch.units, 0) > st.count
    || new Set(st.batches.map((batch) => batch.id)).size !== st.batches.length
    || st.batches.some((batch) => batch.id >= st.nextBatch)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid local production units or batch identities" });
  }
});
export type ProductionBatch = z.infer<typeof ProductionBatchSchema>;
export type BuildingState = z.infer<typeof BuildingStateSchema>;
export const CollectionSchema = z.object({ id: count, units: count.positive(), batches: count.positive() });
export type Collection = z.infer<typeof CollectionSchema>;

export function readyBatches(b: Building, batch: ProductionBatch, time: number): number {
  return b.cycle ? Math.max(0, Math.min(b.cycle.batches ?? 1,
    Math.floor((time - batch.startedAt) / Math.round(b.cycle.hours * 60)))) : 0;
}
export const idleUnits = (st: BuildingState): number => st.count - st.batches.reduce((n, batch) => n + batch.units, 0);
export function collections(b: Building, st: BuildingState, time: number): Collection[] {
  return st.batches.flatMap((batch) => {
    const batches = readyBatches(b, batch, time);
    return batches ? [{ id: batch.id, units: batch.units, batches }] : [];
  });
}
/** Start only empty units; consumed materials belong to this batch rather than the building type. */
export function startProduction(st: BuildingState, time: number, units = idleUnits(st), inputs: Record<string, number> = {}, production?: string) {
  units = Math.min(units, idleUnits(st));
  if (units > 0) st.batches.push({ id: st.nextBatch++, units, startedAt: time, inputs: { ...inputs }, production });
}
/** Only input-free production shares an existing clock with newly built units (unbaited traps). */
export function joinProduction(b: Building, st: BuildingState, units: number) {
  if (!b.cycle || Object.keys(b.cycle.start.cost ?? {}).length) return;
  const batch = st.batches.find((batch) => !Object.values(batch.inputs).some(Boolean) && !batch.production);
  if (batch) batch.units += units;
}

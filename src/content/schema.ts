import { z } from "zod";

/**
 * Zod schemas for every content file. Single source of truth:
 * TypeScript types are inferred from these, and the loader validates JSON against them.
 * Keys starting with "_" (e.g. "_note") are stripped before validation, so they act as comments.
 */

export const Id = z.string().regex(/^[a-z][a-z0-9_]*$/, "ids are lowercase snake_case");
export const Text = z.union([z.string(), z.array(z.string()).min(1)]);
export const Amounts = z.record(Id, z.number().int().positive());
export const Effort = z.enum(["heavy", "work", "light", "rest", "sleep"]);
export type Effort = z.infer<typeof Effort>;

// ---------- conditions ----------

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { item: string; gte?: number; lte?: number }
  | { seen: string }
  | { flag: string }
  | { timer: string; gte?: number; lte?: number }
  | { at: string }
  | { region: string }
  | { stat: string; gte?: number; lte?: number }
  | { warmth: string[] }
  | { phase: string[] }
  | { effort: Effort[] }
  | { day: { gte?: number; lte?: number } };

const range = { gte: z.number().optional(), lte: z.number().optional() };

export const Condition: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(Condition).min(1) }).strict(),
    z.object({ any: z.array(Condition).min(1) }).strict(),
    z.object({ not: Condition }).strict(),
    z.object({ item: Id, ...range }).strict(),
    z.object({ seen: Id }).strict(),
    z.object({ flag: Id }).strict(),
    z.object({ timer: Id, ...range }).strict(),
    z.object({ at: Id }).strict(),
    z.object({ region: Id }).strict(),
    z.object({ stat: Id, ...range }).strict(),
    z.object({ warmth: z.array(Id).min(1) }).strict(),
    z.object({ phase: z.array(Id).min(1) }).strict(),
    z.object({ effort: z.array(Effort).min(1) }).strict(),
    z.object({ day: z.object(range).strict() }).strict(),
  ]),
);

// ---------- effects and outcomes ----------

export type Effect =
  | { give: Record<string, number> }
  | { take: Record<string, number> }
  | { stat: Record<string, number> }
  | { timer: string; addHours: number }
  | { flag: string }
  | { unflag: string }
  | { log: string | string[] }
  | { roll: Outcome[] };

export type Outcome = { weight: number; when?: Condition; text?: string | string[]; effects?: Effect[] };

export const Effect: z.ZodType<Effect> = z.lazy(() =>
  z.union([
    z.object({ give: Amounts }).strict(),
    z.object({ take: Amounts }).strict(),
    z.object({ stat: z.record(Id, z.number()) }).strict(),
    z.object({ timer: Id, addHours: z.number() }).strict(),
    z.object({ flag: Id }).strict(),
    z.object({ unflag: Id }).strict(),
    z.object({ log: Text }).strict(),
    z.object({ roll: z.array(Outcome).min(1) }).strict(),
  ]),
);

export const Outcome: z.ZodType<Outcome> = z.lazy(() =>
  z
    .object({
      weight: z.number().nonnegative(),
      when: Condition.optional(),
      text: Text.optional(),
      effects: z.array(Effect).optional(),
    })
    .strict(),
);

export const Yield = z
  .object({
    item: Id,
    min: z.number().int().nonnegative(),
    max: z.number().int().nonnegative(),
    chance: z.number().min(0).max(1).optional(),
    when: Condition.optional(),
  })
  .strict()
  .refine((y) => y.max >= y.min, "max must be >= min");

// ---------- entities ----------

export const Activity = z
  .object({
    id: Id,
    name: z.string(),
    hours: z.number().positive(),
    effort: Effort,
    visibleWhen: Condition.optional(),
    requires: Condition.optional(),
    requiresText: z.string().optional(),
    cost: Amounts.optional(),
    yields: z.array(Yield).optional(),
    outcomes: z.array(Outcome).optional(),
    effects: z.array(Effect).optional(),
    log: Text.optional(),
    checkpoint: z.boolean().optional(),
  })
  .strict();

export const Region = z
  .object({
    id: Id,
    name: z.string(),
    title: z.string(),
    order: z.number().optional(),
    description: z.array(z.string()),
    climate: z.object({ baseC: z.number() }).strict(),
    travelHours: z.number().nonnegative(),
    unlockWhen: Condition.optional(),
    firstVisit: z.object({ log: Text.optional() }).strict().optional(),
    activities: z.array(Activity),
  })
  .strict();

export const Consume = z
  .object({
    verb: z.string(),
    hours: z.number().positive(),
    effort: Effort.optional(),
    stats: z.record(Id, z.number()).optional(),
    log: Text.optional(),
    outcomes: z.array(Outcome).optional(),
  })
  .strict();

export const Item = z
  .object({
    id: Id,
    name: z.string(),
    plural: z.string().optional(),
    category: z.enum(["material", "food", "water", "tool", "clothing", "container", "component", "special"]),
    consume: Consume.optional(),
  })
  .strict();

export const Timer = z
  .object({
    id: Id,
    name: z.string(),
    region: Id.optional(),
    maxHours: z.number().positive(),
    modifiers: z.object({ localHeatC: z.number().optional() }).strict().optional(),
    states: z.array(z.object({ upToHours: z.number(), word: z.string() }).strict()).min(1),
    warnAtHours: z.number().optional(),
    warnLog: z.string().optional(),
    expireLog: z.string().optional(),
    /** show this timer as a line in the status panel (default true) */
    showInStatus: z.boolean().optional(),
  })
  .strict();

export const Game = z
  .object({
    title: z.string(),
    stepMinutes: z.number().int().positive(),
    start: z
      .object({
        region: Id,
        day: z.number().int().positive(),
        hour: z.number().min(0).max(23.5),
        stats: z.record(Id, z.number().min(0).max(100)),
        items: z.record(Id, z.number().int().nonnegative()),
        log: z.array(z.string()),
      })
      .strict(),
    cosmetic: z.object({ msPerHour: z.number().nonnegative(), maxMs: z.number().nonnegative() }).strict(),
    deathLog: z.string(),
    restoreLog: z.string(),
    timers: z.array(Timer),
  })
  .strict();

export const StatsFile = z
  .object({
    stats: z.array(
      z
        .object({
          id: Id,
          name: z.string(),
          /** label shown in the status panel (defaults to name), e.g. "fullness" for hunger */
          label: z.string().optional(),
          /** true when a high value is bad (hunger, thirst); drives trend arrows and warnings */
          highIsBad: z.boolean().optional(),
          words: z.array(z.object({ upTo: z.number(), word: z.string() }).strict()).min(1),
        })
        .strict(),
    ),
    /** an ink bar at or below this fill (0..100, more is better) is drawn in the danger colour */
    dangerAtOrBelow: z.number().min(0).max(100).optional(),
    ratesPerHour: z.record(Effort, z.record(Id, z.number())),
    multipliers: z.array(z.object({ when: Condition, stat: Id, factor: z.number() }).strict()),
    damage: z.array(z.object({ when: Condition, healthPerHour: z.number(), log: z.string().optional() }).strict()),
    regen: z.array(z.object({ when: Condition, healthPerHour: z.number() }).strict()),
  })
  .strict();

export const Climate = z
  .object({
    phases: z.array(z.object({ id: Id, from: z.number(), to: z.number(), tempC: z.number() }).strict()).min(1),
    /** fill = how full the comfort bar is in this band (0..100) */
    bodyBands: z.array(z.object({ id: Id, belowC: z.number().optional(), fill: z.number().min(0).max(100) }).strict()).min(2),
    warmthLabel: z.string().optional(),
    startBand: Id,
  })
  .strict();

export type Activity = z.infer<typeof Activity>;
export type Region = z.infer<typeof Region>;
export type Item = z.infer<typeof Item>;
export type Timer = z.infer<typeof Timer>;
export type Game = z.infer<typeof Game>;
export type StatsFile = z.infer<typeof StatsFile>;
export type Climate = z.infer<typeof Climate>;
export type Yield = z.infer<typeof Yield>;

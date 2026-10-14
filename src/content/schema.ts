import { z } from "zod";

/**
 * Zod schemas for every content file. Single source of truth:
 * TypeScript types are inferred from these, and the loader validates JSON against them.
 * Keys starting with "_" (e.g. "_note") are stripped before validation, so they act as comments.
 */

export const Id = z.string().regex(/^[a-z][a-z0-9_]*$/, "ids are lowercase snake_case");
/**
 * Every text shown in the journal: one passage, or a list of variants of it. One variant is
 * shown each time, never the same one twice in a row (see chooseText in src/core/text.ts).
 */
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
  | { day: { gte?: number; lte?: number } }
  /** how often an activity, item use or tag was done (default gte 1) */
  | { did: string; gte?: number; lte?: number }
  /** done, found, walked to or finished since you last slept (default gte 1) */
  | { today: string; gte?: number; lte?: number }
  /** the clock has reached this day (and hour) */
  | { reached: { day: number; hour?: number } }
  | { quest: string; is: "active" | "done" }
  /** a discovery made by exploring a region */
  | { discovered: string }
  /** how many times a region was explored */
  | { explored: string; gte?: number; lte?: number };

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
    z.object({ did: Id, ...range }).strict(),
    z.object({ today: Id, ...range }).strict(),
    z.object({ reached: z.object({ day: z.number().int().positive(), hour: z.number().min(0).max(23.5).optional() }).strict() }).strict(),
    z.object({ quest: Id, is: z.enum(["active", "done"]) }).strict(),
    z.object({ discovered: Id }).strict(),
    z.object({ explored: Id, ...range }).strict(),
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
  | { roll: Outcome[] }
  | { startQuest: string };

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
    z.object({ startQuest: Id }).strict(),
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

/**
 * A group of conditional lines, logged when an activity starts (before its own log), e.g. how
 * tired you are when you lie down, then what you remember of the day. Lines are tried in order;
 * at most `max` of the ones whose `when` holds are logged. `intro` comes first if any line is
 * logged; `otherwise` is logged when none is.
 */
export const Thoughts = z
  .object({
    intro: Text.optional(),
    max: z.number().int().positive().optional(),
    lines: z.array(z.object({ text: Text, when: Condition.optional() }).strict()).min(1),
    otherwise: Text.optional(),
  })
  .strict();
export type Thoughts = z.infer<typeof Thoughts>;

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
    /** lines logged before the activity, worked out before it changes anything (see Thoughts) */
    thoughts: z.array(Thoughts).optional(),
    /** lines logged after it, worked out from the state it left (e.g. how you wake) */
    afterwards: z.array(Thoughts).optional(),
    checkpoint: z.boolean().optional(),
    /** counted for { "did": tag } conditions, e.g. "drink" */
    tags: z.array(Id).optional(),
  })
  .strict();

export const Region = z
  .object({
    id: Id,
    name: z.string(),
    title: z.string(),
    order: z.number().optional(),
    /** shown on the first visit */
    description: Text,
    climate: z.object({ baseC: z.number() }).strict(),
    travelHours: z.number().nonnegative(),
    unlockWhen: Condition.optional(),
    firstVisit: z.object({ log: Text.optional() }).strict().optional(),
    /**
     * What you see when you arrive again (the first visit shows `description` instead):
     * every line whose `when` holds, in order. A list of strings picks one at random.
     */
    arrive: z.array(z.object({ text: Text, when: Condition.optional() }).strict()).optional(),
    /** the "look around" action: each use explores the region one step further */
    explore: z
      .object({
        name: z.string(),
        hours: z.number().positive(),
        effort: Effort,
        requires: Condition.optional(),
        requiresText: z.string().optional(),
        /** logged when a step finds nothing new */
        nothingLog: Text.optional(),
        /** hide the button once every discovery is made (default true) */
        hideWhenDone: z.boolean().optional(),
        discoveries: z
          .array(
            z
              .object({
                id: Id,
                /** found on this exploration step (1 = first look around) */
                at: z.number().int().positive(),
                when: Condition.optional(),
                text: Text,
                effects: z.array(Effect).optional(),
              })
              .strict(),
          )
          .min(1),
      })
      .strict()
      .optional(),
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
    /** counted for { "did": tag } conditions, e.g. "eat" */
    tags: z.array(Id).optional(),
  })
  .strict();

/**
 * A small button next to an item in the stores, labelled with `label` (e.g. cook raw fish over the fire).
 * Each use spends `uses` of the item (default 1) plus any extra `cost`.
 */
export const ItemAction = z
  .object({
    id: Id,
    label: z.string(),
    hours: z.number().positive(),
    effort: Effort,
    /** the button is shown only while this is true (e.g. a fire is burning here) */
    visibleWhen: Condition.optional(),
    requires: Condition.optional(),
    requiresText: z.string().optional(),
    uses: z.number().int().positive().optional(),
    cost: Amounts.optional(),
    effects: z.array(Effect).min(1),
    log: Text.optional(),
    tags: z.array(Id).optional(),
  })
  .strict();

export const Item = z
  .object({
    id: Id,
    name: z.string(),
    plural: z.string().optional(),
    category: z.enum(["material", "food", "water", "tool", "clothing", "container", "component", "special"]),
    consume: Consume.optional(),
    actions: z.array(ItemAction).optional(),
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
    warnLog: Text.optional(),
    expireLog: Text.optional(),
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
        /** the opening of the story */
        log: Text,
      })
      .strict(),
    /**
     * How long the progress bar runs after an action (real time; the game clock does not depend on it):
     * hours * msPerHour + printed characters * msPerChar, clamped to [minMs, maxMs].
     */
    cosmetic: z
      .object({
        msPerHour: z.number().nonnegative(),
        msPerChar: z.number().nonnegative(),
        minMs: z.number().nonnegative(),
        maxMs: z.number().nonnegative(),
      })
      .strict(),
    deathLog: Text,
    restoreLog: Text,
    /** journal lines the engine writes itself; {place} is the name of the place */
    journal: z
      .object({
        walkTo: Text,
        wayOpens: Text,
        /** when looking around finds nothing (a region can set its own nothingLog) */
        nothingNew: Text,
      })
      .strict(),
    timers: z.array(Timer),
    /** item categories listed in the inventory box; everything else is listed under stores */
    inventoryCategories: z.array(z.enum(["material", "food", "water", "tool", "clothing", "container", "component", "special"])),
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
    damage: z.array(z.object({ when: Condition, healthPerHour: z.number(), log: Text.optional() }).strict()),
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

export const QuestTrigger = z.union([
  /** active from the first moment of a new game */
  z.literal("start"),
  /** only started by a { "startQuest": id } effect (activity outcome, event, another quest) */
  z.literal("manual"),
  /** becomes active as soon as the condition is true */
  z.object({ when: Condition }).strict(),
]);

export const Quest = z
  .object({
    id: Id,
    title: z.string(),
    /** shown on hover in the tasks panel */
    hint: z.string().optional(),
    trigger: QuestTrigger,
    completeWhen: Condition,
    startLog: Text.optional(),
    doneLog: Text.optional(),
    /** applied when the quest is done (rewards, follow-up quests) */
    effects: z.array(Effect).optional(),
    /**
     * Optional action button next to the quest in the tasks panel (e.g. "build").
     * The panel shows progress towards its cost; clicking spends the cost, takes the time and applies the effects.
     */
    action: z
      .object({
        label: z.string(),
        hours: z.number().positive(),
        effort: Effort,
        requires: Condition.optional(),
        requiresText: z.string().optional(),
        cost: Amounts.optional(),
        effects: z.array(Effect).min(1),
        log: Text.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type Quest = z.infer<typeof Quest>;
export type ItemAction = z.infer<typeof ItemAction>;
export type Activity = z.infer<typeof Activity>;
export type Region = z.infer<typeof Region>;
export type Item = z.infer<typeof Item>;
export type Timer = z.infer<typeof Timer>;
export type Game = z.infer<typeof Game>;
export type StatsFile = z.infer<typeof StatsFile>;
export type Climate = z.infer<typeof Climate>;
export type Yield = z.infer<typeof Yield>;

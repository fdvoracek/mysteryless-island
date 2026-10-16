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
    z.object({ reached: z.object({ day: z.number().int().positive(), hour: z.number().min(0).max(23.75).optional() }).strict() }).strict(),
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
  | { startQuest: string }
  /** open a place: its tab appears, as if its unlockWhen had come true */
  | { unlock: string };

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
    z.object({ unlock: Id }).strict(),
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

/** A place to explore from "look around". Its id is a discovery: { "discovered": id } once explored. */
export const Landmark = z
  .object({
    id: Id,
    /** the button in the pop-up, e.g. "the dunes"; its time is shown next to it */
    label: z.string(),
    hours: z.number().positive(),
    effort: Effort,
    /** offered only while this holds (e.g. the cliff once the rocks are found); new ones bring the * back */
    visibleWhen: Condition.optional(),
    requires: Condition.optional(),
    requiresText: z.string().optional(),
    /** what you find: shown in the pop-up and written to the journal */
    text: Text,
    effects: z.array(Effect).optional(),
  })
  .strict();
export type Landmark = z.infer<typeof Landmark>;

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
    /** where the place sits on the route map (grid cells; x to the right, y down). Default: in a row by order */
    map: z.object({ x: z.number().int(), y: z.number().int() }).strict().optional(),
    unlockWhen: Condition.optional(),
    firstVisit: z.object({ log: Text.optional() }).strict().optional(),
    /**
     * What you see when you arrive again (the first visit shows `description` instead):
     * every line whose `when` holds, in order. A list of strings picks one at random.
     */
    arrive: z.array(z.object({ text: Text, when: Condition.optional() }).strict()).optional(),
    /** the "look around" action: each use explores the region one step further */
    /**
     * "look around": a pop-up (no time passes) that says what you see and offers the landmarks
     * not explored yet. Exploring one takes its time, shows what you found and applies its effects;
     * then it is gone from the list. The button shows a * while something is left to explore.
     */
    explore: z
      .object({
        name: z.string(),
        /** the pop-up's title (default: the region's title) */
        title: z.string().optional(),
        /** what you see: every line whose `when` holds, in order (the pop-up's text) */
        view: z.array(z.object({ text: Text, when: Condition.optional() }).strict()).min(1),
        /** added to the view when nothing is left to explore */
        nothingLeft: Text.optional(),
        landmarks: z.array(Landmark).min(1),
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
    /** how many of the item one use spends (default 1; 0 keeps it, e.g. filling the water can) */
    uses: z.number().int().nonnegative().optional(),
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
    /** the most you can have (e.g. 4 drinks in the water can); getting more stops there */
    max: z.number().int().positive().optional(),
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
        hour: z.number().min(0).max(23.75),
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

/**
 * A task's action button. A list gives alternatives: the first one whose `visibleWhen` holds is
 * used (e.g. carve the spear with the knife in 1 h, or with a sharp stone in 3 h).
 */
export const QuestAction = z
  .object({
    label: z.string(),
    visibleWhen: Condition.optional(),
    hours: z.number().positive(),
    effort: Effort,
    requires: Condition.optional(),
    requiresText: z.string().optional(),
    cost: Amounts.optional(),
    effects: z.array(Effect).min(1),
    log: Text.optional(),
  })
  .strict();

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
    action: z.union([QuestAction, z.array(QuestAction).min(1)]).optional(),
  })
  .strict();

export type Quest = z.infer<typeof Quest>;

// ---------- events ----------

/** A button in an event. Its effects apply when chosen; then the event goes to `next` (or ends). */
export const EventChoice = z
  .object({
    id: Id,
    label: z.string(),
    visibleWhen: Condition.optional(),
    requires: Condition.optional(),
    requiresText: z.string().optional(),
    effects: z.array(Effect).optional(),
    /** the scene to show next; omitted = the event ends */
    next: Id.optional(),
  })
  .strict();

/** One page of an event. Without choices it gets a single button that ends the event (`close`). */
export const EventScene = z
  .object({
    text: Text,
    /** applied when the scene opens */
    effects: z.array(Effect).optional(),
    choices: z.array(EventChoice).min(1).optional(),
    /** label of the button that ends the event, for a scene without choices */
    close: z.string().optional(),
  })
  .strict();

/**
 * When an event opens:
 * - "start": at the very beginning of a new game, before the first journal line
 * - { at: { day, hour } }: once the clock reaches that moment (checked after each action)
 * - { when: Condition }: as soon as the condition holds (checked after each action)
 * - { after: [...], chance }: a roll after one of these actions succeeds: activity ids, tags,
 *   item ids (eating, cooking), "explore" or "travel"; omit `after` for any action
 */
export const EventTrigger = z.union([
  z.literal("start"),
  z.object({ at: z.object({ day: z.number().int().positive(), hour: z.number().min(0).max(23.75).optional() }).strict() }).strict(),
  z.object({ when: Condition }).strict(),
  z.object({ after: z.array(Id).min(1).optional(), chance: z.number().gt(0).max(1) }).strict(),
]);

export const GameEvent = z
  .object({
    id: Id,
    title: z.string(),
    trigger: EventTrigger,
    /** an extra condition for any trigger (e.g. only on the beach) */
    when: Condition.optional(),
    /** by default an event happens once; with repeat it can come back after cooldownHours */
    repeat: z.object({ cooldownHours: z.number().nonnegative() }).strict().optional(),
    /** save a checkpoint when the event ends (dying later starts from here) */
    checkpoint: z.boolean().optional(),
    /** the event opens on the scene called "start" */
    scenes: z.record(Id, EventScene),
  })
  .strict();
export type GameEvent = z.infer<typeof GameEvent>;
export type EventScene = z.infer<typeof EventScene>;
export type QuestAction = z.infer<typeof QuestAction>;
export type ItemAction = z.infer<typeof ItemAction>;
export type Activity = z.infer<typeof Activity>;
export type Region = z.infer<typeof Region>;
export type Item = z.infer<typeof Item>;
export type Timer = z.infer<typeof Timer>;
export type Game = z.infer<typeof Game>;
export type StatsFile = z.infer<typeof StatsFile>;
export type Climate = z.infer<typeof Climate>;
export type Yield = z.infer<typeof Yield>;

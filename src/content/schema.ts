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
export const Text = z.union([
  z.string(), z.array(z.string()).min(1),
  z.object({ id: Id, variants: z.array(z.string()).min(1) }).strict(),
]);
export type Text = z.infer<typeof Text>;
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
  | { explored: string; gte?: number; lte?: number }
  /** you have something with this tool tag (game.json → tools), e.g. something sharp */
  | { tool: string }
  /** A building stands; `here` restricts it to the current region. */
  | { built: string; here?: boolean }
  | { sheltered: boolean }
  /** a building's cycle: idle (built, nothing running), working (e.g. the corn is growing) or ready (to collect) */
  | { building: string; is: "idle" | "working" | "ready" };

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
    z.object({ tool: Id }).strict(),
    z.object({ built: Id, here: z.boolean().optional() }).strict(),
    z.object({ sheltered: z.boolean() }).strict(),
    z.object({ building: Id, is: z.enum(["idle", "working", "ready"]) }).strict(),
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
  | { log: Text }
  | { roll: Outcome[] }
  | { startQuest: string }
  /** open a place: its tab appears, as if its unlockWhen had come true */
  | { unlock: string }
  /** put up a building where you are, without its build step (e.g. from an event) */
  | { build: string }
  /** start a building's cycle without its start step (e.g. the field is sown as it is dug) */
  | { startCycle: string; production?: string; units?: number };

export type Outcome = { weight: number; when?: Condition; text?: Text; effects?: Effect[] };

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
    z.object({ build: Id }).strict(),
    z.object({ startCycle: Id, production: Id.optional(), units: z.number().int().positive().optional() }).strict(),
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

/** small pictures for the map: hovering a place shows one per activity found there (src/ui/icons.ts) */
export const Icon = z.enum(["fire", "water", "wood", "stone", "fish", "meat", "berries", "corn", "mushrooms", "honey", "shells", "shelter", "sleep"]);

/** Shared work fields; entity schemas retain their own visibility, identity and rewards. */
const WorkFields = {
  hours: z.number().positive(),
  effort: Effort,
  requires: Condition.optional(),
  requiresText: z.string().optional(),
  cost: Amounts.optional(),
  log: Text.optional(),
  effects: z.array(Effect).optional(),
};

export const Activity = z
  .object({
    ...WorkFields,
    id: Id,
    /** Shared actions such as sleep are available in every region. */
    global: z.boolean().optional(),
    /** Group this activity with a local building in the UI. */
    building: Id.optional(),
    name: z.string(),
    /** shown on the map when you hover the place, once the activity is visible (found) */
    icon: Icon.optional(),
    visibleWhen: Condition.optional(),
    yields: z.array(Yield).optional(),
    outcomes: z.array(Outcome).optional(),
    /** lines logged before the activity, worked out before it changes anything (see Thoughts) */
    thoughts: z.array(Thoughts).optional(),
    /** lines logged after it, worked out from the state it left (e.g. how you wake) */
    afterwards: z.array(Thoughts).optional(),
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
    /** Natural shelter at this place, once its discovery condition is met. */
    shelterWhen: Condition.optional(),
    travelHours: z.number().nonnegative(),
    /** where the place sits on the route map (grid cells; x to the right, y down). Default: in a row by order */
    map: z.object({ x: z.number().int(), y: z.number().int() }).strict().optional(),
    /** while locked: when its "?" shows on the map (default: from the start; e.g. once you have seen the cliff) */
    hintWhen: Condition.optional(),
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

/** One step of a building's cycle: start it (sow, set the trap) or collect what it made (harvest). */
export const BuildingStep = z
  .object({
    ...WorkFields,
    /** counted like an activity id: { "did": id }, { "today": id }, event `after` */
    id: Id,
    label: z.string(),
    yields: z.array(Yield).optional(),
    outcomes: z.array(Outcome).optional(),
    tags: z.array(Id).optional(),
  })
  .strict();

/**
 * Something you build in a place. It is offered (a "build" button in that place's buildings panel,
 * and on a task with `build`) once `availableWhen` holds, in each of its `places` whose `when`
 * holds; it can stand once in each of them (a fish trap on the beach and one in the river).
 * A building can warm its place (`warmthC`) and be named in conditions ({ "built": id }), e.g.
 * the bed makes sleep better (a stats multiplier). With a `cycle` it produces over time: `start`
 * begins it; every `hours` one batch is ready, up to `batches` (default 1); `collect` gives the
 * yield once per batch ready. Then it is idle again, or with `repeat` it goes on by itself.
 */
export const Building = z
  .object({
    id: Id,
    name: z.string(),
    /** shown on hover in the buildings panel */
    hint: z.string().optional(),
    /** shown on the map when you hover the place */
    icon: Icon.optional(),
    /** where it can be built; `when`: only once this holds there (e.g. the river is found) */
    places: z.array(z.object({ region: Id, when: Condition.optional() }).strict()).min(1),
    /** when it is offered in the build menu (e.g. once its task has started); default always */
    availableWhen: Condition.optional(),
    /** how many can stand in one place (default 1): several fish traps, several fields */
    max: z.number().int().positive().optional(),
    /** putting it up: label (default "build"), time, cost, extra requirements, what happens */
    build: z
      .object({
        ...WorkFields,
        label: z.string().optional(),
      })
      .strict(),
    /** degrees added to the felt temperature in its place (e.g. a shelter out of the wind) */
    warmthC: z.number().optional(),
    /** A timer describes this building's current state, e.g. a local campfire. */
    timer: Id.optional(),
    /** the panel's word for a building without a cycle (default "built") */
    word: z.string().optional(),
    cycle: z
      .object({
        start: BuildingStep,
        /**
     * game hours per batch, counted from the end of `start` (or of `collect`, with repeat). With
     * several in a place they work together: `start` and `collect` cost and take that many times as
     * much, and each batch yields that many times.
     */
        hours: z.number().positive(),
        /** how many batches can wait to be collected (default 1): a trap holds up to 3 fish */
        batches: z.number().int().positive().optional(),
        /** after collecting, it starts again by itself (a trap stays set) */
        repeat: z.boolean().optional(),
        collect: BuildingStep,
        /** Named output alternatives selected by a startCycle effect. */
        products: z.record(Id, z.array(Yield)).optional(),
        /** the panel's words: nothing running, running (time left is added), ready ({n}: batches ready) */
        words: z.object({ idle: z.string(), working: z.string(), ready: z.string() }).strict(),
        /** written to the journal when the first batch is ready while you are there (and awake) */
        readyLog: Text.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type Building = z.infer<typeof Building>;
export type BuildingStep = z.infer<typeof BuildingStep>;

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
 * An item control, grouped under its building or carried item (e.g. cook raw fish over the fire).
 * Each use spends `uses` of the item (default 1) plus any extra `cost`.
 */
export const ItemAction = z
  .object({
    ...WorkFields,
    id: Id,
    /** Show this action under the local building instead of carried items. */
    building: Id.optional(),
    label: z.string(),
    /** the button is shown only while this is true (e.g. a fire is burning here) */
    visibleWhen: Condition.optional(),
    /** how many of the item one use spends (default 1; 0 keeps it, e.g. filling the water can) */
    uses: z.number().int().nonnegative().optional(),
    effects: z.array(Effect).min(1),
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
    /**
     * What it is good for, as tool tags (game.json → tools): a requirement { "tool": tag } is met by
     * any item with the tag, `amount` of it (default 1; 2 stones strike a spark). With `hoursFactor`
     * the action takes that many times as long (the rock knife is sharp, but slow).
     */
    tool: z
      .object({ tags: z.array(Id).min(1), amount: z.number().int().positive().optional(), hoursFactor: z.number().min(1).optional() })
      .strict()
      .optional(),
    consume: Consume.optional(),
    actions: z.array(ItemAction).optional(),
  })
  .strict();

export const Timer = z
  .object({
    id: Id,
    name: z.string(),
    region: Id.optional(),
    local: z.boolean().optional(),
    building: Id.optional(),
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
     * Real-time rate for paced clock steps and the progress bar:
     * hours * msPerHour; sleep and zero-time commands are immediate.
     */
    cosmetic: z
      .object({
        msPerHour: z.number().nonnegative(),
      })
      .strict(),
    deathLog: Text,
    sleep: z.object({
      bed: Id,
      shelter: Id,
      fire: Id,
      wakeHour: z.number().int().min(1).max(23),
      passOutHour: z.number().int().min(0).max(23),
      recovery: z.object({
        early_warm_bed: z.object({ energy: z.number().min(0).max(100), text: Text }).strict(),
        early_unheated_bed: z.object({ energy: z.number().min(0).max(100), text: Text }).strict(),
        late_warm_bed: z.object({ energy: z.number().min(0).max(100), text: Text }).strict(),
        late_unheated_bed: z.object({ energy: z.number().min(0).max(100), text: Text }).strict(),
        exposed_bed: z.object({ energy: z.number().min(0).max(100), text: Text }).strict(),
        ground: z.object({ energy: z.number().min(0).max(100), text: Text }).strict(),
      }).strict(),
      newDay: Text,
      collapse: z.object({ title: Text, text: Text }).strict(),
      midnight: Text,
      exhausted: Text,
    }).strict(),
    /** Automatic provisions, checked during clock steps and after successful commands. */
    provisions: z.object({
      at: z.number().gt(0).max(100),
      title: Text,
      hunger: Text,
      thirst: Text,
      both: Text,
      preparation: z.object({ when: Condition, text: Text }).strict(),
    }).strict(),
    /**
     * The note when a task is done: title ({task}), then the task's doneLog and what changed:
     * gained ({item}, {where}: inventory or consumables), used ({item}), opened ({place}), possible ({action}),
     * built ({building})
     */
    tasks: z.object({ title: Text, gained: Text, used: Text, opened: Text, possible: Text, built: Text }).strict(),
    /**
     * A place new on the map ({place}): `text` under the finding (or in a note titled `title`) and
     * `go`, the label of the button that walks there.
     */
    newPlace: z.object({ title: Text, text: Text, go: z.string() }).strict(),
    /**
     * Tool tags: `label` is shown next to the items that have it (knife · sharp); `needs` says what
     * a requirement { "tool": tag } asks for, without naming an item ("something sharp").
     */
    tools: z.record(Id, z.object({ label: z.string(), needs: z.string() }).strict()),
    /** the craft and build menus: the button, the pop-up's title, its text, and the text when it offers nothing */
    menus: z.object({
      craft: z.object({ button: z.string(), title: z.string(), text: Text, empty: Text }).strict(),
      build: z.object({ button: z.string(), title: z.string(), text: Text, empty: Text }).strict(),
    }).strict(),
    /**
     * The end screen when you die (death is permanent): how long you lasted ({time}, {day}) and why
     * ({cause}: the damage rule's cause, an event's title, or defaultCause). `load` and `restart`
     * label its buttons.
     */
    ending: z
      .object({
        title: z.string(),
        survived: Text,
        cause: Text,
        defaultCause: z.string(),
        restart: z.string(),
        /** the button that loads the saved game (shown only when there is one) */
        load: z.string(),
      })
      .strict(),
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
    /** `cause`: named on the end screen when this rule is what kills you, e.g. "thirst" */
    damage: z.array(z.object({ when: Condition, healthPerHour: z.number(), log: Text.optional(), cause: z.string().optional() }).strict()),
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
 * One way to craft a recipe. A recipe lists its ways; the first whose `visibleWhen` holds is used
 * (e.g. carve the spear with the knife in 30 min, or grind it with a sharp stone in 1.5 h).
 */
export const RecipeWay = z
  .object({
    ...WorkFields,
    visibleWhen: Condition.optional(),
  })
  .strict();

/**
 * Something you can make, offered in the craft menu (a pop-up) once `availableWhen` holds. Making it
 * gives `count` of `item` (default 1). It leaves the menu once you have it, unless `multiple`.
 */
export const Recipe = z
  .object({
    id: Id,
    item: Id,
    count: z.number().int().positive().optional(),
    /** the button (default: the item's name) */
    label: z.string().optional(),
    availableWhen: Condition.optional(),
    /** can be made again while you have one (default: only while you have none) */
    multiple: z.boolean().optional(),
    ways: z.array(RecipeWay).min(1),
    tags: z.array(Id).optional(),
  })
  .strict();
export type Recipe = z.infer<typeof Recipe>;
export type RecipeWay = z.infer<typeof RecipeWay>;

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
    /** The task's building goal (it is built in the build menu). */
    build: Id.optional(),
    /**
     * Requirement metadata for content and simulations: items or buildings; a
     * list inside the list means any one of them, e.g. [["fishing_spear", "fish_trap"]].
     */
    needs: z.array(z.union([Id, z.array(Id).min(2)])).optional(),
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
    /**
     * label of the button that ends the event, for a scene without choices (default "back", the
     * arrow in the title line; in the story before the island it is a button under the text)
     */
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
    /** the event opens on the scene called "start" */
    scenes: z.record(Id, EventScene),
  })
  .strict();
export type GameEvent = z.infer<typeof GameEvent>;
export type EventScene = z.infer<typeof EventScene>;
export type ItemAction = z.infer<typeof ItemAction>;
export type Activity = z.infer<typeof Activity>;
export type Icon = z.infer<typeof Icon>;
export type Region = z.infer<typeof Region>;
export type Item = z.infer<typeof Item>;
export type Timer = z.infer<typeof Timer>;
export type Game = z.infer<typeof Game>;
export type StatsFile = z.infer<typeof StatsFile>;
export type Climate = z.infer<typeof Climate>;
export type Yield = z.infer<typeof Yield>;

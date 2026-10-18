import { z } from "zod";

const number = z.number().finite();
const count = number.int().nonnegative();
const counts = z.record(count);
const strings = z.array(z.string());
export const RngSchema = z.tuple([number.int(), number.int(), number.int(), number.int()]);
export const RegionStateSchema = z.object({
  unlocked: z.boolean(), visited: z.boolean(), explored: count.default(0), discoveries: strings.default([]),
});
export const QuestStateSchema = z.object({
  status: z.enum(["active", "done"]), startedAt: count, doneAt: count.optional(),
});
export const NoteSchema = z.object({ title: z.string(), text: z.string(), go: strings.optional() });
export const EventsStateSchema = z.object({
  active: z.object({ id: z.string(), scene: z.string(), text: z.string(), title: z.string().optional(), go: strings.optional(), hint: z.string().optional() }).nullable(),
  queue: strings,
  notes: z.array(NoteSchema).optional(),
  seen: z.record(z.object({ count, lastAt: count })),
});
export const LogEntrySchema = z.object({ at: count, text: z.string(), turn: count.optional() });

/** The serializable runtime model is also the save validator; types are inferred from it. */
export const GameStateSchema = z.object({
  saveVersion: count,
  seed: number.int(),
  rng: RngSchema,
  time: count,
  location: z.string(),
  stats: z.record(number.min(0).max(100)),
  warmth: count,
  items: counts,
  seen: strings,
  flags: strings,
  counters: counts.default({}),
  today: counts.default({}),
  provisionWarnings: strings.optional(),
  lastText: counts.default({}),
  events: EventsStateSchema.default({ active: null, queue: [], seen: {} }),
  quests: z.record(QuestStateSchema).default({}),
  timers: z.record(number.nonnegative()).default({}),
  regions: z.record(RegionStateSchema),
  buildings: z.record(z.object({ count: count.min(1).default(1), builtAt: count, startedAt: count.optional() })).default({}),
  prevStats: z.record(number.min(0).max(100)),
  log: z.array(LogEntrySchema),
  turn: count.optional(),
  dead: z.boolean(),
  death: z.object({ time: count, cause: z.string(), lines: strings }).optional(),
});

export type GameState = z.infer<typeof GameStateSchema>;
export type LogEntry = z.infer<typeof LogEntrySchema>;
export type RegionState = z.infer<typeof RegionStateSchema>;
export type QuestState = z.infer<typeof QuestStateSchema>;
export type EventsState = z.infer<typeof EventsStateSchema>;

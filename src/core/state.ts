import type { Registry } from "../content/registry";
import { seedRng, type RngState } from "./rng";
import { chooseText } from "./text";

export const SAVE_VERSION = 1;

/** One line of story. `turn` groups the lines one command produced (0 = the intro). */
export interface LogEntry { at: number; text: string; turn?: number }

export interface RegionState {
  unlocked: boolean;
  visited: boolean;
  /** how many times the region was explored ("look around") */
  explored: number;
  discoveries: string[];
}

export interface QuestState { status: "active" | "done"; startedAt: number; doneAt?: number }

/** Events: the one open now (with the wording chosen for its scene), those waiting, and the history. */
export interface EventsState {
  active: { id: string; scene: string; text: string } | null;
  /** events waiting to open after the current one (e.g. several "start" events) */
  queue: string[];
  seen: Record<string, { count: number; lastAt: number }>;
}

/** The whole game state. Plain JSON data: no classes, no Maps. */
export interface GameState {
  saveVersion: number;
  seed: number;
  rng: RngState;
  /** minutes since day 1, 00:00 */
  time: number;
  location: string;
  stats: Record<string, number>;
  /** index into climate.bodyBands */
  warmth: number;
  items: Record<string, number>;
  seen: string[];
  flags: string[];
  /** how often things were done: "did:<activity id | item id | tag>" -> count */
  counters: Record<string, number>;
  /**
   * What happened since you last slept, for { "today": ... } conditions (memories when you lie down):
   * the same keys as `did` (activity, item, tag) plus discoveries, places walked to and tasks finished.
   */
  today: Record<string, number>;
  /** the variant shown last per text (keyed by its first variant), so it isn't shown twice in a row */
  lastText: Record<string, number>;
  events: EventsState;
  /** quests that have started; absent = not started yet */
  quests: Record<string, QuestState>;
  /** minutes left per timer */
  timers: Record<string, number>;
  regions: Record<string, RegionState>;
  /** stats before the last command, for trend arrows */
  prevStats: Record<string, number>;
  log: LogEntry[];
  /** increases with every command; log lines remember it so the UI can show one paragraph per action */
  turn?: number;
  dead: boolean;
}

export function createInitialState(reg: Registry, seed: number): GameState {
  const { start } = reg.game;
  const regions: GameState["regions"] = {};
  for (const id of reg.regionOrder) {
    const r = reg.regions.get(id)!;
    regions[id] = { unlocked: !r.unlockWhen || id === start.region, visited: id === start.region, explored: 0, discoveries: [] };
  }
  const timers: Record<string, number> = {};
  for (const t of reg.timers.keys()) timers[t] = 0;
  const time = (start.day - 1) * 1440 + Math.round(start.hour * 60);
  const state: GameState = {
    saveVersion: SAVE_VERSION,
    seed,
    rng: seedRng(seed),
    time,
    location: start.region,
    stats: { ...start.stats },
    warmth: Math.max(0, reg.bandIds.indexOf(reg.climate.startBand)),
    items: { ...start.items },
    seen: Object.keys(start.items).filter((k) => start.items[k] > 0),
    flags: [],
    counters: {},
    today: {},
    lastText: {},
    events: { active: null, queue: [], seen: {} },
    quests: {},
    timers,
    regions,
    prevStats: { ...start.stats },
    // the log array is newest-first in time order; the views put each action's lines back in reading order
    log: [],
    turn: 0,
    dead: false,
  };
  // with a "start" event, the opening line is written when that event ends (you reach the beach)
  const startEvent = [...reg.events.values()].some((e) => e.trigger === "start");
  if (!startEvent) state.log.push({ at: time, text: chooseText(start.log, state), turn: 0 });
  return state;
}

export const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));

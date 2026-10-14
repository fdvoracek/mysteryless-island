import type { Registry } from "../content/registry";
import { seedRng, type RngState } from "./rng";

export const SAVE_VERSION = 1;

export interface LogEntry { at: number; text: string }

export interface RegionState {
  unlocked: boolean;
  visited: boolean;
  /** how many times the region was explored ("look around") */
  explored: number;
  discoveries: string[];
}

export interface QuestState { status: "active" | "done"; startedAt: number; doneAt?: number }

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
  /** quests that have started; absent = not started yet */
  quests: Record<string, QuestState>;
  /** minutes left per timer */
  timers: Record<string, number>;
  regions: Record<string, RegionState>;
  /** stats before the last command, for trend arrows */
  prevStats: Record<string, number>;
  log: LogEntry[];
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
  return {
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
    quests: {},
    timers,
    regions,
    prevStats: { ...start.stats },
    // the log is newest-first; the intro is stored in reading order so it reads top-down
    log: start.log.map((text) => ({ at: time, text })),
    dead: false,
  };
}

export const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));

import type { Registry } from "../content/registry";
import { initialTechnology } from "./technology";
import { seedRng } from "./rng";
import { chooseText } from "./text";
import { timerKey } from "./timers";

import type { GameState } from "./state-schema";
export type { GameState, LogEntry, RegionState, QuestState, EventsState } from "./state-schema";

export const SAVE_VERSION = 7;

export function createInitialState(reg: Registry, seed: number): GameState {
  const { start } = reg.game;
  const regions: GameState["regions"] = {};
  for (const id of reg.regionOrder) {
    const r = reg.regions.get(id)!;
    regions[id] = { unlocked: !r.unlockWhen || id === start.region, visited: id === start.region, explored: 0, discoveries: [] };
  }
  const timers: Record<string, number> = {};
  for (const t of reg.timers.values()) {
    for (const region of t.local ? reg.regionOrder : [reg.game.start.region]) timers[timerKey(reg, t.id, region)] = 0;
  }
  const time = (start.day - 1) * 1440 + Math.round(start.hour * 60);
  const state: GameState = {
    saveVersion: SAVE_VERSION,
    technology: initialTechnology(reg),
    seed,
    rng: seedRng(seed),
    narrativeRng: seedRng(seed ^ 0x4e415252),
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
    buildings: {},
    prevStats: { ...start.stats },
    // the log array is newest-first in time order; the views put each action's lines back in reading order
    log: [],
    turn: 0,
    actions: [],
    nextAction: 1,
    dead: false,
  };
  // with a "start" event, the opening line is written when that event ends (you reach the beach)
  const startEvent = [...reg.events.values()].some((e) => e.trigger === "start");
  if (!startEvent) state.log.push({ at: time, text: chooseText(start.log, state, undefined, typeof start.log === "object" ? reg.textKeys.get(start.log) : undefined), turn: 0 });
  return state;
}

export const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));

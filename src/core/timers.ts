import type { Registry } from "../content/registry";
import type { GameState } from "./state";

export function timerKey(reg: Registry, id: string, region: string): string {
  return reg.timers.get(id)?.local ? `${id}@${region}` : id;
}

export function timerValue(reg: Registry, state: GameState, id: string, region = state.location): number {
  return state.timers[timerKey(reg, id, region)] ?? 0;
}

/** Upgrade the old shared fire to the beach; never invent a burning fire for an existing bed. */
export function initializeTimers(reg: Registry, state: Pick<GameState, "timers" | "buildings">) {
  for (const timer of reg.timers.values()) {
    if (!timer.local) { state.timers[timer.id] ??= 0; continue; }
    if (timer.id in state.timers) {
      const region = timer.region ?? reg.game.start.region;
      const key = timerKey(reg, timer.id, region);
      state.timers[key] ??= state.timers[timer.id];
      if (state.timers[key] > 0 && timer.building) {
        state.buildings[`${timer.building}@${region}`] ??= { count: 1, builtAt: 0 };
      }
      delete state.timers[timer.id];
    }
    for (const region of reg.regionOrder) state.timers[timerKey(reg, timer.id, region)] ??= 0;
  }
}

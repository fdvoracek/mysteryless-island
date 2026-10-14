import type { Engine } from "../core/engine";

/**
 * Debug helpers on window.ti (open the browser console):
 *   ti.give("firewood", 10)   ti.stat("thirst", 0)   ti.time(5)   ti.fire(6)
 *   ti.state()                ti.check({ "timer": "fire" })        ti.reset()
 */
export function installDebug(getEngine: () => Engine, rerender: () => void, reset: () => void) {
  const api = {
    give(item: string, n = 1) { getEngine().applyEffects([{ give: { [item]: n } }]); rerender(); },
    stat(stat: string, value: number) { const e = getEngine(); e.state.stats[stat] = value; rerender(); },
    time(hours: number, effort: "rest" | "sleep" | "light" | "work" | "heavy" = "rest") { getEngine().advance(hours, effort); rerender(); },
    fire(hours: number) { getEngine().applyEffects([{ timer: "fire", addHours: hours }]); rerender(); },
    state() { return JSON.parse(JSON.stringify(getEngine().state)); },
    felt() { return getEngine().feltTemperature(); },
    reset() { reset(); },
  };
  (window as unknown as { ti: typeof api }).ti = api;
}

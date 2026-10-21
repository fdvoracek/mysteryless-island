import { describe, expect, it } from "vitest";
import { view } from "../src/core/selectors";
import { loadRegistry, revealAll, startGame } from "./helpers";

const reg = loadRegistry();
/** a game with the beach and forest fully explored (exploration is tested separately) */
const fresh = (seed = 1) => {
  const e = revealAll(startGame(reg, seed));
  e.applyEffects([{ build: "campfire" }]);
  return e;
};

describe("engine: the prototype loop", () => {

  it("shells: collect, eat raw, or cook over the fire for more food", () => {
    const e = fresh(5);
    e.dispatch({ type: "activity", id: "collect_shells" });
    expect(e.state.items.shells).toBeGreaterThanOrEqual(2);
    const cookIcon = () => view(e).buildings.find((b) => b.id === "campfire")?.actions.find((a) => a.label === "cook shells");
    expect(cookIcon()).toBeUndefined(); // no fire, no cook button
    e.state.stats.hunger = 60;
    e.dispatch({ type: "consume", item: "shells" });
    const rawGain = 60 - e.state.stats.hunger;
    e.applyEffects([{ give: { firewood: 3 } }]);
    e.dispatch({ type: "activity", id: "light_fire" });
    expect(cookIcon()).toMatchObject({ enabled: true, label: "cook shells" });
    e.dispatch({ type: "itemAction", item: "shells", action: "cook" });
    e.state.stats.hunger = 60;
    e.dispatch({ type: "consume", item: "cooked_shells" });
    const cookedGain = 60 - e.state.stats.hunger;
    expect(cookedGain).toBeGreaterThan(rawGain);
  });

  it("refuses forest activities on the beach", () => {
    const e = fresh();
    expect(e.dispatch({ type: "activity", id: "gather_wood" }).ok).toBe(false);
  });

  it("gather wood, drink, return, light fire, cook fish, sleep: full loop", () => {
    const e = fresh(7);
    e.dispatch({ type: "travel", region: "forest" });
    e.dispatch({ type: "activity", id: "gather_wood" });
    e.dispatch({ type: "activity", id: "gather_wood" });
    expect(e.state.items.firewood).toBeGreaterThanOrEqual(6);

    const thirstBefore = e.state.stats.thirst;
    e.dispatch({ type: "activity", id: "drink_stream" });
    expect(e.state.stats.thirst).toBeLessThan(thirstBefore);

    e.dispatch({ type: "travel", region: "beach" });
    expect(e.dispatch({ type: "activity", id: "light_fire" }).ok).toBe(true);
    expect(e.state.timers[`fire@${e.state.location}`]).toBeGreaterThan(0);

    // fish until we have one (seeded, so deterministic)
    e.applyEffects([{ give: { fishing_spear: 1 } }]);
    for (let i = 0; i < 5 && !(e.state.items.raw_fish > 0); i++) e.dispatch({ type: "activity", id: "catch_fish" });
    expect(e.state.items.raw_fish).toBeGreaterThan(0);
    expect(e.dispatch({ type: "itemAction", item: "raw_fish", action: "cook" }).ok).toBe(true);
    expect(e.state.items.cooked_fish).toBe(1);
    e.dispatch({ type: "consume", item: "cooked_fish" });
    expect(e.state.items.cooked_fish).toBe(0);

    if (!(e.state.timers[`fire@${e.state.location}`] > 0)) e.dispatch({ type: "activity", id: "light_fire" });
    e.applyEffects([{ build: "bed" }]);
    const sleep = e.dispatch({ type: "activity", id: "sleep" });
    expect(sleep.ok).toBe(true);
    expect(e.state.stats.energy).toBe(100);
  });

  it("stoke fire appears only while the fire burns, and the fire is capped", () => {
    const e = fresh();
    e.applyEffects([{ give: { firewood: 20 } }]);
    e.dispatch({ type: "activity", id: "light_fire" });
    const ids = view(e).actions.map((a) => a.id);
    expect(ids).toContain("stoke_fire");
    expect(ids).not.toContain("light_fire");
    for (let i = 0; i < 5; i++) e.dispatch({ type: "activity", id: "stoke_fire" });
    expect(e.state.timers[`fire@${e.state.location}`]).toBeLessThanOrEqual(12 * 60);
  });

  it("the fire burns down over time and goes out", () => {
    const e = fresh();
    e.applyEffects([{ give: { firewood: 3 } }]);
    e.dispatch({ type: "activity", id: "light_fire" });
    e.advance(7, "rest");
    expect(e.state.timers[`fire@${e.state.location}`]).toBe(0);
    expect(e.state.log.some((l) => l.text.includes("fire goes out"))).toBe(true);
  });

  it("is deterministic for the same seed and commands", () => {
    const run = () => {
      const e = fresh(42);
      e.applyEffects([{ give: { fishing_spear: 1 } }]);
      for (let i = 0; i < 6; i++) e.dispatch({ type: "activity", id: "catch_fish" });
      return e.state.items.raw_fish ?? 0;
    };
    expect(run()).toBe(run());
  });

  it("body warmth drops at night away from the fire and recovers by the fire", () => {
    const e = fresh();
    e.dispatch({ type: "travel", region: "forest" });
    e.advance(16, "rest"); // into the night in the forest: 18 - 8 = 10 °C -> cold
    expect(reg.bandIds[e.state.warmth]).toBe("cold");
    e.dispatch({ type: "travel", region: "beach" });
    e.applyEffects([{ give: { firewood: 3 } }]);
    e.dispatch({ type: "activity", id: "light_fire" });
    e.advance(2, "rest"); // 20 - 8 + 6 = 18 °C -> comfortable
    expect(reg.bandIds[e.state.warmth]).toBe("comfortable");
  });

  it("the clock moves in 15-minute steps: a 15-minute action takes 15 minutes, and stats drain per hour as before", () => {
    expect(reg.game.stepMinutes).toBe(15);
    const e = fresh();
    e.applyEffects([{ give: { shells: 1 } }]);
    const t0 = e.state.time;
    const thirst0 = e.state.stats.thirst;
    e.dispatch({ type: "consume", item: "shells" }); // eat raw: 15 min
    expect(e.state.time - t0).toBe(15);
    const perQuarter = e.state.stats.thirst - thirst0;
    e.advance(1, "light");
    expect(e.state.stats.thirst - thirst0 - perQuarter).toBeCloseTo(perQuarter * 4, 5); // an hour = 4 steps
  });

  it("times every command at the shared hourly rate, with instant menus and sleep", () => {
    const e = fresh();
    expect(reg.game.cosmetic.msPerHour).toBe(10_000);
    expect(e.progressMs(0)).toBe(0);
    expect(e.progressMs(0.25)).toBe(2_500);
    expect(e.progressMs(1)).toBe(10_000);
    expect(e.progressMs(8)).toBe(80_000); // no maximum duration
    expect(e.dispatch({ type: "travel", region: "forest" })).toMatchObject({ ok: true, cooldownMs: 5_000 });
    expect(e.dispatch({ type: "activity", id: "gather_wood" }).cooldownMs).toBe(5_000);
    e.applyEffects([{ give: { shells: 1 } }]);
    expect(e.dispatch({ type: "consume", item: "shells" }).cooldownMs).toBe(2_500);
    e.applyEffects([{ build: "bed" }]);
    expect(e.dispatch({ type: "activity", id: "sleep" })).toMatchObject({ ok: true, cooldownMs: 0 });
    expect(e.state.time % 1440).toBe(6 * 60);
  });

  it("uses the configured rate for command durations", () => {
    const custom = loadRegistry();
    custom.game.cosmetic.msPerHour = 2_000;
    const e = revealAll(startGame(custom, 1));
    expect(e.dispatch({ type: "travel", region: "forest" }).cooldownMs).toBe(1_000);
    expect(e.dispatch({ type: "activity", id: "gather_wood" }).cooldownMs).toBe(1_000);
    e.applyEffects([{ give: { water_can: 1 } }]);
    expect(e.dispatch({ type: "itemAction", item: "water_can", action: "fill" }).cooldownMs).toBe(500);
  });
});

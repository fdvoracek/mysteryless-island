import { describe, expect, it } from "vitest";
import { Engine } from "../src/core/engine";
import { clockText } from "../src/core/clock";
import { view } from "../src/core/selectors";
import { loadRegistry, revealAll } from "./helpers";

const reg = loadRegistry();
/** a game with the beach and forest fully explored (exploration is tested separately) */
const fresh = (seed = 1) => revealAll(Engine.newGame(reg, seed));

describe("engine: the prototype loop", () => {
  it("starts at dawn on the beach with only 'look around'", () => {
    const e = Engine.newGame(reg, 1);
    expect(e.state.location).toBe("beach");
    expect(clockText(e.state.time)).toBe("06:00");
    expect(view(e).actions.map((a) => a.label)).toEqual(["look around"]);
    expect(view(e).tabs.map((t) => t.id)).toEqual(["beach"]);
  });

  it("once the beach is explored: fire, shells, spear, fish, sleep", () => {
    const e = fresh();
    const v = view(e);
    expect(v.actions.map((a) => a.id)).toEqual(["light_fire", "collect_shells", "make_spear", "catch_fish", "sleep"]);
    expect(v.actions.find((a) => a.id === "light_fire")!.enabled).toBe(false);
    expect(v.actions.find((a) => a.id === "catch_fish")!.reason).toBe("needs 1 wooden spear");
    expect(v.actions.find((a) => a.id === "sleep")!.reason).toContain("without a fire");
  });

  it("fishing needs a wooden spear; making one costs a branch and hides the button", () => {
    const e = fresh();
    expect(e.dispatch({ type: "activity", id: "catch_fish" }).ok).toBe(false);
    e.applyEffects([{ give: { firewood: 1 } }]);
    expect(e.dispatch({ type: "activity", id: "make_spear" }).ok).toBe(true);
    expect(e.state.items).toMatchObject({ wooden_spear: 1, firewood: 0 });
    expect(view(e).actions.map((a) => a.id)).not.toContain("make_spear");
    expect(e.dispatch({ type: "activity", id: "catch_fish" }).ok).toBe(true);
  });

  it("shells: collect, eat raw, or cook over the fire for more food", () => {
    const e = fresh(5);
    e.dispatch({ type: "activity", id: "collect_shells" });
    expect(e.state.items.shells).toBeGreaterThanOrEqual(2);
    expect(view(e).actions.find((a) => a.id === "cook_shells")!.reason).toBe("the fire is out");
    e.state.stats.hunger = 60;
    e.dispatch({ type: "consume", item: "shells" });
    const rawGain = 60 - e.state.stats.hunger;
    e.applyEffects([{ give: { firewood: 3 } }]);
    e.dispatch({ type: "activity", id: "light_fire" });
    e.dispatch({ type: "activity", id: "cook_shells" });
    e.state.stats.hunger = 60;
    e.dispatch({ type: "consume", item: "cooked_shells" });
    const cookedGain = 60 - e.state.stats.hunger;
    expect(cookedGain).toBeGreaterThan(rawGain);
  });

  it("refuses forest activities on the beach", () => {
    const e = fresh();
    expect(e.dispatch({ type: "activity", id: "gather_wood" }).ok).toBe(false);
  });

  it("travel to the forest costs one hour and reveals its description once", () => {
    const e = fresh();
    const t0 = e.state.time;
    expect(e.dispatch({ type: "travel", region: "forest" }).ok).toBe(true);
    expect(e.state.time - t0).toBe(60);
    expect(e.state.location).toBe("forest");
    expect(e.state.log.some((l) => l.text.includes("water runs over stones"))).toBe(true);
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
    expect(e.state.timers.fire).toBeGreaterThan(0);

    // fish until we have one (seeded, so deterministic)
    e.applyEffects([{ give: { wooden_spear: 1 } }]);
    for (let i = 0; i < 5 && !(e.state.items.raw_fish > 0); i++) e.dispatch({ type: "activity", id: "catch_fish" });
    expect(e.state.items.raw_fish).toBeGreaterThan(0);
    expect(e.dispatch({ type: "activity", id: "cook_fish" }).ok).toBe(true);
    expect(e.state.items.cooked_fish).toBe(1);
    e.dispatch({ type: "consume", item: "cooked_fish" });
    expect(e.state.items.cooked_fish).toBe(0);

    if (!(e.state.timers.fire > 0)) e.dispatch({ type: "activity", id: "light_fire" });
    const energyBefore = e.state.stats.energy;
    const sleep = e.dispatch({ type: "activity", id: "sleep" });
    expect(sleep.ok).toBe(true);
    expect(e.state.stats.energy).toBeGreaterThan(energyBefore);
    expect(e.checkpoint.time).toBe(e.state.time); // sleeping creates a checkpoint
  });

  it("stoke fire appears only while the fire burns, and the fire is capped", () => {
    const e = fresh();
    e.applyEffects([{ give: { firewood: 20 } }]);
    e.dispatch({ type: "activity", id: "light_fire" });
    const ids = view(e).actions.map((a) => a.id);
    expect(ids).toContain("stoke_fire");
    expect(ids).not.toContain("light_fire");
    for (let i = 0; i < 5; i++) e.dispatch({ type: "activity", id: "stoke_fire" });
    expect(e.state.timers.fire).toBeLessThanOrEqual(12 * 60);
  });

  it("the fire burns down over time and goes out", () => {
    const e = fresh();
    e.applyEffects([{ give: { firewood: 3 } }]);
    e.dispatch({ type: "activity", id: "light_fire" });
    e.advance(7, "rest");
    expect(e.state.timers.fire).toBe(0);
    expect(e.state.log.some((l) => l.text.includes("fire goes out"))).toBe(true);
  });

  it("is deterministic for the same seed and commands", () => {
    const run = () => {
      const e = fresh(42);
      e.applyEffects([{ give: { wooden_spear: 1 } }]);
      for (let i = 0; i < 6; i++) e.dispatch({ type: "activity", id: "catch_fish" });
      return e.state.items.raw_fish ?? 0;
    };
    expect(run()).toBe(run());
  });

  it("dying restores the last checkpoint", () => {
    const e = fresh();
    const checkpointTime = e.checkpoint.time;
    e.state.stats.thirst = 100;
    e.state.stats.hunger = 100;
    e.state.stats.health = 3;
    const r = e.dispatch({ type: "activity", id: "collect_shells" });
    expect(r.died).toBe(true);
    expect(e.state.dead).toBe(true);
    expect(e.dispatch({ type: "travel", region: "forest" }).ok).toBe(false);
    e.restoreCheckpoint();
    expect(e.state.dead).toBe(false);
    expect(e.state.time).toBe(checkpointTime);
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
});

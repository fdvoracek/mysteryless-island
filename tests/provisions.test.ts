import { describe, expect, it } from "vitest";
import { Engine } from "../src/core/engine";
import { view } from "../src/core/selectors";
import { build, loadRegistry, lookAround, revealAll, startGame } from "./helpers";

const reg = loadRegistry();
const fresh = () => {
  const e = revealAll(startGame(reg, 42, "knife", { keepNotes: true }));
  e.state.quests.first_catch.status = "done"; // keep tests focused on the provision popups
  return e;
};
const travel = (e: Engine) => e.dispatch({ type: "travel", region: e.state.location === "beach" ? "forest" : "beach" });
const close = (e: Engine) => e.dispatch({ type: "choose", choice: "close" });

describe("automatic provisions", () => {
  it("eats and drinks before starvation damage, without adding time to the action", () => {
    const e = fresh();
    e.state.stats.hunger = e.state.stats.thirst = 80;
    e.applyEffects([{ give: { rations: 2, can_water: 2 } }]);
    const time = e.state.time, health = e.state.stats.health;
    expect(travel(e).ok).toBe(true);
    expect(e.state.time - time).toBe(30);
    expect(e.state.items).toMatchObject({ rations: 1, can_water: 1 });
    expect(e.state.stats.hunger).toBeLessThan(60);
    expect(e.state.stats.thirst).toBeLessThan(60);
    expect(e.state.stats.health).toBeGreaterThanOrEqual(health);
    expect(e.state.counters).toMatchObject({ "did:eat": 1, "did:drink": 1 });
    expect(e.state.today).toMatchObject({ eat: 1, drink: 1 });
  });

  it("leaves supplies alone below the threshold", () => {
    const e = fresh();
    e.state.stats.hunger = e.state.stats.thirst = 20;
    e.applyEffects([{ give: { berries: 4, can_water: 4 } }]);
    travel(e);
    expect(e.state.items).toMatchObject({ berries: 4, can_water: 4 });
    expect(e.state.counters["did:eat"]).toBeUndefined();
  });

  it("uses multiple small portions when necessary and stops as soon as the need is met", () => {
    const e = fresh();
    e.state.stats.hunger = 79;
    e.applyEffects([{ give: { berries: 10 } }]);
    travel(e);
    expect(e.state.stats.hunger).toBeLessThan(60);
    expect(e.state.items.berries).toBe(5);
  });

  it("prefers the most filling available food, deterministically", () => {
    const e = fresh();
    e.state.stats.hunger = 60;
    e.applyEffects([{ give: { berries: 10, rations: 2 } }]);
    travel(e);
    expect(e.state.items).toMatchObject({ berries: 10, rations: 1 });
  });

  it("continues using supplies throughout a long action", () => {
    const e = fresh();
    e.state.stats.hunger = e.state.stats.thirst = 59;
    e.applyEffects([{ give: { rations: 10, can_water: 4 } }]);
    const time = e.state.time;
    expect(e.advance(12, "rest")).toBe(true);
    expect(e.state.time - time).toBe(720);
    expect(e.state.items.rations).toBe(9);
    expect(e.state.items.can_water).toBe(2);
    expect(e.state.stats.hunger).toBeLessThan(60);
    expect(e.state.stats.thirst).toBeLessThan(60);
  });

  it("does not also eat automatically during a manually chosen meal", () => {
    const e = fresh();
    e.state.stats.hunger = 60;
    e.applyEffects([{ give: { rations: 2 } }]);
    e.dispatch({ type: "consume", item: "rations" });
    expect(e.state.items.rations).toBe(1);
    expect(e.state.counters["did:eat"]).toBe(1);
  });

  it.each([
    [70, 20, "Eat soon"],
    [20, 70, "Drink soon"],
    [70, 70, "Eat and drink soon"],
  ])("warns for hunger %s and thirst %s", (hunger, thirst, message) => {
    const e = fresh();
    e.state.stats.hunger = hunger;
    e.state.stats.thirst = thirst;
    travel(e);
    expect(view(e).event).toMatchObject({ id: "note", title: "Supplies running low" });
    expect(view(e).event!.text).toContain(message);
    expect(view(e).event!.text).toContain("collapse");
    expect(travel(e)).toMatchObject({ ok: false, reason: "an event is open" });
    close(e);
    expect(view(e).event).toBeNull();
    expect(travel(e).ok).toBe(true);
    expect(view(e).event).toBeNull(); // no repeated popup for the same shortage
  });

  it("remembers dismissed warnings in saves and warns again after relief", () => {
    const e = fresh();
    e.state.stats.thirst = 70;
    travel(e);
    close(e);
    const resumed = new Engine(reg, JSON.parse(JSON.stringify(e.state)));
    travel(resumed);
    expect(view(resumed).event).toBeNull();
    resumed.applyEffects([{ give: { can_water: 1 } }]);
    travel(resumed);
    expect(resumed.state.stats.thirst).toBeLessThan(60);
    resumed.state.stats.thirst = 70;
    travel(resumed);
    expect(view(resumed).event?.text).toContain("Drink soon");
  });

  it("automatically eats food obtained by the current action", () => {
    const e = fresh();
    e.state.location = "meadows";
    e.state.stats.hunger = 60;
    e.dispatch({ type: "activity", id: "collect_berries" });
    expect(e.state.stats.hunger).toBeLessThan(60);
    expect(e.state.counters["did:eat"]).toBeGreaterThan(0);
  });

  it("refuses raw meat and fish manually and automatically, while keeping cooking available", () => {
    const e = fresh();
    e.state.stats.hunger = 70;
    e.applyEffects([{ give: { raw_meat: 2, raw_fish: 2 } }]);
    for (const item of ["raw_meat", "raw_fish"]) {
      expect(e.dispatch({ type: "consume", item }).ok).toBe(false);
      expect(view(e).stores.find((row) => row.id === item)?.use).toBeUndefined();
    }
    travel(e);
    expect(e.state.items).toMatchObject({ raw_meat: 2, raw_fish: 2 });
    expect(view(e).event!.text).toContain("build a simple drying rack");
    close(e);
    travel(e);
    e.state.timers[`fire@${e.state.location}`] = 360;
    e.dispatch({ type: "itemAction", item: "raw_meat", action: "cook" });
    expect(e.state.items.raw_meat).toBe(1);
    expect(e.state.stats.hunger).toBeLessThan(60);
    expect(e.state.counters["did:cooked_meat"]).toBe(1);
  });
});

describe("one drying rack for fish and meat", () => {
  it.each(["raw_fish", "raw_meat"])("offers the rack and preparation advice when automatic eating finds only %s", (item) => {
    const e = fresh();
    e.state.stats.hunger = 60;
    e.state.stats.thirst = 0;
    e.applyEffects([{ give: { [item]: 2 } }]);
    expect(e.state.quests.build_drying_rack).toBeUndefined();
    travel(e);
    expect(e.state.quests.build_drying_rack.status).toBe("active");
    expect(view(e).event!.text).toContain("build a simple drying rack");
    expect(view(e).event!.text).toContain("cook them over a fire");
    close(e);
    travel(e);
    expect(e.buildable("drying_rack")).toBe(true);
  });

  it("does not offer a rack just for carrying raw food, or when edible food meets the need", () => {
    for (const hunger of [20, 60]) {
      const e = fresh();
      e.state.stats.hunger = hunger;
      e.applyEffects([{ give: { raw_meat: 2, rations: 1 } }]);
      travel(e);
      expect(e.state.quests.build_drying_rack).toBeUndefined();
    }
  });

  it("adds preparation advice when raw meat is found after an earlier empty-food warning", () => {
    const e = fresh();
    e.state.stats.hunger = 60;
    travel(e); close(e);
    expect(e.state.quests.build_drying_rack).toBeUndefined();
    e.applyEffects([{ give: { raw_meat: 2 } }]);
    travel(e);
    expect(e.state.quests.build_drying_rack.status).toBe("active");
    expect(view(e).event!.text).toContain("build a simple drying rack");
  });

  it("plays through building, drying meat, collecting, then drying fish on the same rack", () => {
    const e = startGame(reg, 11);
    lookAround(e); lookAround(e); // dunes and the sheltered rocks
    e.applyEffects([{ give: { raw_meat: 2, raw_fish: 2, timber: 2 } }]);
    e.state.stats.hunger = 60;
    e.state.stats.thirst = 0;
    // Automatic eating fails with only raw food, unlocking the drying-rack task.
    e.dispatch({ type: "explore" }); close(e);
    e.state.stats.hunger = 0;
    expect(build(e, "drying_rack").ok).toBe(true);
    expect(e.dispatch({ type: "itemAction", item: "raw_meat", action: "dry" }).ok).toBe(true);
    expect(e.state.items.raw_meat).toBe(0);
    expect(e.dispatch({ type: "building", id: "drying_rack", step: "start" }).ok).toBe(false);
    for (let i = 0; i < 2; i++) {
      e.state.stats.hunger = e.state.stats.thirst = 0;
      e.advance(6, "rest");
    }
    expect(e.dispatch({ type: "building", id: "drying_rack", step: "collect" }).ok).toBe(true);
    expect(e.state.items.dried_meat).toBe(2);
    expect(e.state.items.dried_fish ?? 0).toBe(0);
    expect(e.dispatch({ type: "building", id: "drying_rack", step: "start" }).ok).toBe(true);
    e.applyEffects([{ give: { raw_meat: 2 } }]);
    expect(e.dispatch({ type: "itemAction", item: "raw_meat", action: "dry" }).ok).toBe(false);
    for (let i = 0; i < 2; i++) {
      e.state.stats.hunger = e.state.stats.thirst = 0;
      e.advance(6, "rest");
    }
    expect(e.dispatch({ type: "building", id: "drying_rack", step: "collect" }).ok).toBe(true);
    expect(e.state.items.dried_fish).toBe(2);
    expect(e.state.items.dried_meat).toBe(2);
    expect(Object.keys(e.state.buildings)).toEqual(["drying_rack@beach"]);
  });
});

import { describe, expect, it } from "vitest";
import { Engine } from "../src/core/engine";
import { view } from "../src/core/selectors";
import { buildRegistry } from "../src/content/registry";
import { craft, loadRegistry, readContentFiles, revealAll, startGame } from "./helpers";

const reg = loadRegistry();
const fresh = () => {
  const e = revealAll(startGame(reg, 1));
  e.state.stats = { health: 100, energy: 100, hunger: 30, thirst: 30 };
  return e;
};
const sleep = (e: Engine) => e.dispatch({ type: "activity", id: "sleep" });

describe("energy is the daily work budget", () => {
  it.each([
    [30, 30, 5], [60, 30, 7.5], [30, 60, 7.5], [100, 100, 7.5], [0, 0, 2.5],
  ])("hunger %s and thirst %s cost %s energy per hour of work", (hunger, thirst, cost) => {
    const e = fresh();
    e.state.stats.hunger = hunger;
    e.state.stats.thirst = thirst;
    e.advance(1, "work");
    expect(e.state.stats.energy).toBeCloseTo(100 - cost);
    expect(e.state.stats.health).toBe(100);
  });

  it("walking, gathering, and crafting all spend time and energy", () => {
    const e = fresh();
    const check = (run: () => unknown) => {
      const before = { time: e.state.time, energy: e.state.stats.energy };
      run();
      expect(e.state.time).toBeGreaterThan(before.time);
      expect(e.state.stats.energy).toBeLessThan(before.energy);
    };
    check(() => e.dispatch({ type: "travel", region: "forest" }));
    check(() => e.dispatch({ type: "activity", id: "gather_wood" }));
    e.state.items.knife = 0;
    e.applyEffects([{ give: { stone: 2 } }]);
    check(() => craft(e, "craft_rock_knife"));
  });

  it("changes energy costs at a hunger/thirst boundary independently of JSON key order", () => {
    const energies = [false, true].map((reverse) => {
      const files = readContentFiles();
      const stats = files["content/stats.json"] as { ratesPerHour: Record<string, Record<string, number>> };
      if (reverse) stats.ratesPerHour.work = Object.fromEntries(Object.entries(stats.ratesPerHour.work).reverse());
      const e = startGame(buildRegistry(files), 1);
      e.state.stats = { health: 100, energy: 100, hunger: 40, thirst: 40 };
      e.advance(1, "work");
      return e.state.stats.energy;
    });
    expect(energies).toEqual([93.125, 93.125]);
  });

  it("food, carried drinks, and drinking at a spring restore energy", () => {
    const e = fresh();
    e.state.stats.energy = 20;
    e.applyEffects([{ give: { rations: 1, can_water: 1 } }]);
    e.dispatch({ type: "consume", item: "rations" });
    expect(e.state.stats.energy).toBeGreaterThan(20);
    const afterFood = e.state.stats.energy;
    e.dispatch({ type: "consume", item: "can_water" });
    expect(e.state.stats.energy).toBeGreaterThan(afterFood);
    e.dispatch({ type: "travel", region: "forest" });
    const beforeSpring = e.state.stats.energy;
    e.dispatch({ type: "activity", id: "drink_stream" });
    expect(e.state.stats.energy).toBeGreaterThan(beforeSpring);
  });

  it("empty food and water bars cannot kill the player", () => {
    const e = fresh();
    e.state.stats.health = 1;
    e.state.stats.hunger = e.state.stats.thirst = 100;
    e.advance(4, "work");
    expect(e.state.dead).toBe(false);
    expect(e.state.stats.health).toBe(1);
    expect(e.state.stats.energy).toBe(70);
  });
});

describe("sleep always ends at 6am", () => {
  it.each(["midnight", "exhausted"])("shows a dismissible collapse modal after %s, before queued task notes", (reason) => {
    const e = revealAll(startGame(reg, 1, "knife", { keepNotes: true }));
    e.state.location = "forest";
    e.state.time = reason === "midnight" ? 23 * 60 + 45 : 12 * 60;
    if (reason === "exhausted") e.state.stats.energy = 0.1;
    e.dispatch({ type: "travel", region: "beach" });
    expect(view(e).event).toMatchObject({ id: "note", title: "You passed out" });
    expect(view(e).event!.text).toContain("Exhaustion leaves you sleeping on the ground");
    expect(view(e).event!.text).toContain("at the forest");
    expect(view(e).event!.text).toContain("New day 2 is starting.");
    expect(e.dispatch({ type: "activity", id: "sleep" })).toMatchObject({ ok: false, reason: "an event is open" });
    e.dispatch({ type: "choose", choice: "close" });
    expect(view(e).event!.title).toBe("Task done: survive the first night");
  });

  it.each([
    [22, true, 100], [23.75, true, 100], [0, true, 80], [1.75, true, 80],
  ])("at %s with bed %s restores exactly %s energy", (hour, bed, energy) => {
    const e = fresh();
    e.state.time = (hour < 6 ? 1440 : 0) + hour * 60;
    e.state.stats.energy = 10;
    if (bed) e.applyEffects([{ build: "bed" }, { timer: "fire", addHours: 6 }]);
    expect(sleep(e).ok).toBe(true);
    expect(e.state.time).toBe(1440 + 360);
    expect(e.state.stats.energy).toBe(energy);
    expect(e.state.location).toBe("beach");
    expect(e.state.log.some((line) => line.text === "New day 2 is starting.")).toBe(true);
    expect(e.state.log.some((line) => line.text.includes(`${energy}% energy at 6am`) || line.text.includes(`6am with ${energy}% energy`))).toBe(true);
  });

  it("offers sleep only with a bed in this area and refuses direct commands without one", () => {
    const e = fresh();
    expect(view(e).actions.find((a) => a.id === "sleep")).toBeUndefined();
    expect(e.willSleep({ type: "activity", id: "sleep" })).toBe(false);
    expect(sleep(e)).toMatchObject({ ok: false });
    e.applyEffects([{ build: "bed" }]);
    expect(view(e).actions.find((a) => a.id === "sleep")).toMatchObject({ enabled: true });
    e.state.location = "forest";
    e.state.time = 22 * 60;
    expect(view(e).actions.find((a) => a.id === "sleep")).toBeUndefined();
    expect(view(e).tabs.find((t) => t.id === "beach")!.icons).toContain("sleep");
    expect(view(e).tabs.find((t) => t.id === "forest")!.icons).not.toContain("sleep");
    expect(e.willSleep({ type: "activity", id: "sleep" })).toBe(false);
    const before = e.state.time;
    expect(sleep(e)).toMatchObject({ ok: false });
    expect(e.state.time).toBe(before);
    e.applyEffects([{ build: "bed" }]); // a bed supplied here by content, such as an event
    expect(view(e).actions.find((a) => a.id === "sleep")).toMatchObject({ enabled: true });
    expect(e.willSleep({ type: "activity", id: "sleep" })).toBe(true);
    sleep(e);
    expect(e.state.location).toBe("forest");
    expect(e.state.stats.energy).toBe(50);
    expect(e.state.log.some((line) => line.text.includes("no shelter"))).toBe(true);
    expect(e.state.today.forest).toBeUndefined();
    expect(e.state.today.sleep).toBeUndefined();
  });

  it("shows the actual time until morning in the sleep tooltip", () => {
    const e = fresh();
    e.state.time = 23 * 60;
    e.applyEffects([{ build: "bed" }]);
    expect(view(e).actions.find((a) => a.id === "sleep")!.tooltip).toContain("7h · sleep");
  });

  it("passes out at midnight during travel, stays at the departure place, and cancels the remaining work", () => {
    const e = fresh();
    e.state.location = "forest";
    e.state.time = 23 * 60 + 45; // 11:45pm
    const result = e.dispatch({ type: "travel", region: "beach" });
    expect(result).toMatchObject({ ok: true, interrupted: true });
    expect(result.died).not.toBe(true);
    expect(e.state.time).toBe(1440 + 360);
    expect(e.state.location).toBe("forest");
    expect(e.state.stats.energy).toBe(50);
    expect(e.state.log.some((line) => line.text.startsWith("Midnight."))).toBe(true);
  });

  it("a collapse at midnight where there is a bed restores 80%", () => {
    const e = fresh();
    e.applyEffects([{ build: "bed" }]);
    e.state.time = 23 * 60 + 45;
    expect(e.dispatch({ type: "activity", id: "collect_stones" }).interrupted).toBe(true);
    expect(e.state.stats.energy).toBe(80);
    expect(e.state.time).toBe(1440 + 360);
  });

  it("energy exhaustion interrupts crafting without producing the item or losing its materials", () => {
    const e = fresh();
    e.state.stats.energy = 0.1;
    e.state.items.knife = 0;
    e.applyEffects([{ give: { stone: 2 } }]);
    const result = craft(e, "craft_rock_knife");
    expect(result.interrupted).toBe(true);
    expect(e.state.items.stone).toBe(0);
    expect(e.state.actions[0]).toMatchObject({ status: "paused", reserved: { stone: 2 }, completedMinutes: 15 });
    expect(e.state.items.rock_knife ?? 0).toBe(0);
    expect(e.state.counters["did:craft_rock_knife"]).toBeUndefined();
    expect(e.state.time).toBe(1440 + 360);
    expect(e.state.stats.energy).toBe(50);
    expect(e.state.dead).toBe(false);
  });

  it("interrupted cooking reserves its raw food without creating a cooked portion", () => {
    const e = fresh();
    e.state.stats.energy = 0.1;
    e.state.timers[`fire@${e.state.location}`] = 360;
    e.applyEffects([{ give: { raw_meat: 1 } }]);
    expect(e.dispatch({ type: "itemAction", item: "raw_meat", action: "cook" }).interrupted).toBe(true);
    expect(e.state.items.raw_meat).toBe(0);
    expect(e.state.actions[0]).toMatchObject({ status: "paused", reserved: { raw_meat: 1 } });
    expect(e.state.items.cooked_meat ?? 0).toBe(0);
  });

  it("a ready production cycle remains collectable if collection is interrupted", () => {
    const e = fresh();
    e.applyEffects([{ build: "drying_rack" }]);
    e.applyEffects([{ startCycle: "drying_rack" }]);
    e.state.buildings["drying_rack@beach"].batches[0].startedAt = e.state.time - 720;
    e.state.time = 23 * 60 + 45;
    expect(e.dispatch({ type: "building", id: "drying_rack", step: "collect" }).interrupted).toBe(true);
    expect(e.state.items.dried_fish ?? 0).toBe(0);
    expect(e.buildingStepFor("drying_rack")?.step).toBe("collect");
    expect(e.dispatch({ type: "building", id: "drying_rack", step: "collect" }).interrupted).not.toBe(true);
    expect(e.state.items.dried_fish).toBe(2);
  });

  it("an interrupted landmark is not marked as discovered", () => {
    const e = startGame(reg, 1);
    e.state.time = 23 * 60 + 45;
    e.dispatch({ type: "explore" });
    expect(e.dispatch({ type: "choose", choice: "forest_edge" }).interrupted).toBe(true);
    expect(e.state.regions.beach.discoveries).not.toContain("forest_edge");
    expect(e.state.regions.forest.unlocked).toBe(false);
    expect(e.state.events.active).toBeNull();
  });

  it("overnight timers and production still progress, and the state can be saved and resumed", () => {
    const e = fresh();
    e.applyEffects([{ build: "drying_rack" }, { startCycle: "drying_rack" }, { build: "bed" }]);
    e.state.timers[`fire@${e.state.location}`] = 60;
    sleep(e); // early bedtime skips 24 hours to tomorrow morning
    expect(e.state.timers[`fire@${e.state.location}`]).toBe(0);
    expect(e.buildingStepFor("drying_rack")?.step).toBe("collect");
    const resumed = new Engine(reg, JSON.parse(JSON.stringify(e.state)));
    expect(resumed.state.time).toBe(e.state.time);
    expect(resumed.state.stats.energy).toBe(100);
  });

  it("validates the bed reference and the order of the overnight hours", () => {
    for (const patch of [{ bed: "unknown_bed" }, { passOutHour: 8 }]) {
      const files = readContentFiles();
      Object.assign((files["content/game.json"] as { sleep: object }).sleep, patch);
      expect(() => buildRegistry(files)).toThrow();
    }
  });
});

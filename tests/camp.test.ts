import { restoreState } from "../src/persistence/migrate";
import { describe, expect, it } from "vitest";
import { Engine, type SleepRecoveryReason } from "../src/core/engine";
import { evaluate } from "../src/core/conditions";
import { timerValue } from "../src/core/timers";
import { view } from "../src/core/selectors";
import { buildRegistry } from "../src/content/registry";
import { build, loadRegistry, lookAround, readContentFiles, revealAll, startGame } from "./helpers";

const reg = loadRegistry();
const fresh = (keepNotes = false) => {
  const e = revealAll(startGame(reg, 7, "knife", { keepNotes }));
  e.state.time = 22 * 60;
  e.state.stats = { health: 100, energy: 10, hunger: 0, thirst: 0 };
  return e;
};

describe("local shelter and buildings", () => {
  it("the discovered beach rocks allow a bed before the first night without building a shelter", () => {
    const e = startGame(reg, 1);
    lookAround(e); lookAround(e);
    expect(evaluate({ sheltered: true }, e.ctx())).toBe(true);
    expect(e.buildOptions()).toContain("bed");
    expect(e.buildOptions()).not.toContain("shelter");
    expect(e.state.quests.survive_first_night.status).toBe("active");
    expect(e.state.quests.better_sleep).toBeUndefined();
    e.applyEffects([{ give: { timber: 2, firewood: 4 } }]);
    expect(build(e, "bed").ok).toBe(true);
    expect(e.builtHere("shelter")).toBe(0);
    expect(view(e).actions.find((a) => a.id === "sleep")?.enabled).toBe(true);
  });

  it.each(["forest", "meadows"])("requires a shelter here before building a bed in %s", (region) => {
    const e = fresh();
    e.state.location = region;
    e.state.time = 12 * 60;
    e.state.stats.energy = 100;
    expect(evaluate({ sheltered: false }, e.ctx())).toBe(true);
    expect(e.buildOptions()).not.toContain("bed");
    e.applyEffects([{ give: { timber: 6, firewood: 4 } }]);
    expect(build(e, "shelter").ok).toBe(true);
    expect(evaluate({ sheltered: true }, e.ctx())).toBe(true);
    expect(build(e, "bed").ok).toBe(true);
    expect(e.builtHere("bed")).toBe(1);
    e.state.location = region === "forest" ? "meadows" : "forest";
    expect(evaluate({ sheltered: true }, e.ctx())).toBe(false);
    expect(e.buildOptions()).not.toContain("bed");
  });

  it("builds and lights a campfire locally; remote fire cannot warm the beach or cook food there", () => {
    const e = fresh();
    e.state.location = "forest";
    e.state.time = 12 * 60;
    e.state.stats.energy = 100;
    e.applyEffects([{ give: { stone: 2, firewood: 3, matches: 1, raw_fish: 2 } }]);
    expect(view(e).actions.find((a) => a.id === "light_fire")).toBeUndefined();
    expect(build(e, "campfire").ok).toBe(true);
    expect(timerValue(reg, e.state, "fire")).toBe(0);
    const cold = e.feltTemperature();
    expect(e.dispatch({ type: "activity", id: "light_fire" }).ok).toBe(true);
    expect(timerValue(reg, e.state, "fire")).toBe(360);
    expect(e.feltTemperature()).toBe(cold + 6);
    expect(e.dispatch({ type: "itemAction", item: "raw_fish", action: "cook" }).ok).toBe(true);
    expect(e.state.items.cooked_fish).toBe(1);
    e.dispatch({ type: "travel", region: "beach" });
    expect(timerValue(reg, e.state, "fire")).toBe(0);
    expect(e.feltTemperature()).toBe(20);
    expect(e.dispatch({ type: "itemAction", item: "raw_fish", action: "cook" }).ok).toBe(false);
    expect(view(e).buildings.find((b) => b.id === "campfire")).toBeUndefined();
    const forestFire = timerValue(reg, e.state, "fire", "forest");
    e.applyEffects([{ build: "campfire" }, { timer: "fire", addHours: 6 }]);
    e.advance(1, "rest");
    expect(timerValue(reg, e.state, "fire")).toBe(300);
    expect(timerValue(reg, e.state, "fire", "forest")).toBe(forestFire - 60);
    expect(view(e).buildings.find((b) => b.id === "campfire")?.word).toBe("burning");
  });

  it("validates natural shelter references and rejects recursive shelter conditions", () => {
    for (const condition of [{ discovered: "missing_rocks" }, { sheltered: true }]) {
      const files = readContentFiles();
      (files["content/regions/beach.json"] as { shelterWhen: unknown }).shelterWhen = condition;
      expect(() => buildRegistry(files)).toThrow();
    }
  });
});

describe("bedtime recovery and its exact summary", () => {
  const cases: Array<{ reason: SleepRecoveryReason; hour: number; bed: boolean; shelter: boolean; fire: boolean; energy: number; words: string[] }> = [
    { reason: "early_warm_bed", hour: 22, bed: true, shelter: true, fire: true, energy: 100, words: ["before midnight", "sheltered bed", "with a fire burning"] },
    { reason: "early_unheated_bed", hour: 22, bed: true, shelter: true, fire: false, energy: 80, words: ["before midnight", "without a burning fire"] },
    { reason: "late_warm_bed", hour: 1, bed: true, shelter: true, fire: true, energy: 80, words: ["after midnight", "with a fire burning"] },
    { reason: "late_unheated_bed", hour: 1, bed: true, shelter: true, fire: false, energy: 80, words: ["after midnight", "without a burning fire"] },
    { reason: "exposed_bed", hour: 22, bed: true, shelter: false, fire: true, energy: 50, words: ["without shelter"] },
    { reason: "ground", hour: 22, bed: false, shelter: true, fire: true, energy: 50, words: ["without a bed"] },
  ];
  for (const c of cases) {
    for (const forced of c.bed ? [false, true] : [true]) {
      it(`${c.reason}, ${forced ? "collapse modal" : "voluntary sleep"}: ${c.energy}% and matching text`, () => {
        const e = fresh(true);
        e.state.time = (c.hour < 6 ? 1440 : 0) + c.hour * 60;
        if (!c.shelter) e.state.regions.beach.discoveries = [];
        if (c.bed) e.applyEffects([{ build: "bed" }]);
        if (c.fire) e.applyEffects([{ build: "campfire" }, { timer: "fire", addHours: 6 }]);
        expect(e.sleepRecovery()).toEqual({ reason: c.reason, energy: c.energy });
        if (forced) {
          e.state.stats.energy = 0;
          e.dispatch({ type: "travel", region: "forest" });
        } else e.dispatch({ type: "activity", id: "sleep" });
        expect(e.state.time).toBe(1800);
        expect(e.state.stats.energy).toBe(c.energy);
        const expected = (reg.game.sleep.recovery[c.reason].text as string)
          .replace("{place}", "the beach").replace("{energy}", String(c.energy));
        expect(e.state.log.some((line) => line.text === expected)).toBe(true);
        for (const words of c.words) expect(expected).toContain(words);
        if (forced) {
          expect(view(e).event?.title).toBe("You passed out");
          expect(view(e).event?.text).toContain(expected);
        } else expect(view(e).event?.title).not.toBe("You passed out");
      });
    }
  }

  it("a fire that expires before bedtime gives the unheated summary and 80% recovery", () => {
    const e = fresh();
    e.state.time = 21 * 60 + 30;
    e.applyEffects([{ build: "bed" }, { timer: "fire", addHours: 0.25 }]);
    e.advance(0.5, "rest");
    expect(e.sleepRecovery()).toEqual({ reason: "early_unheated_bed", energy: 80 });
    e.dispatch({ type: "activity", id: "sleep" });
    expect(e.state.stats.energy).toBe(80);
    expect(e.state.log.some((line) => line.text.includes("without a burning fire"))).toBe(true);
  });

  it("a fire expiring overnight preserves the bedtime reason and truthful bedtime wording", () => {
    const e = fresh();
    e.applyEffects([{ build: "bed" }, { timer: "fire", addHours: 0.25 }]);
    e.dispatch({ type: "activity", id: "sleep" });
    expect(timerValue(reg, e.state, "fire")).toBe(0);
    expect(e.state.stats.energy).toBe(100);
    expect(e.state.log.some((line) => line.text.includes("went to sleep before midnight") && line.text.includes("with a fire burning"))).toBe(true);
  });

  it("a remote fire cannot improve a local bed's recovery or its summary", () => {
    const e = fresh();
    e.applyEffects([{ build: "bed" }]);
    e.state.location = "forest";
    e.applyEffects([{ build: "campfire" }, { timer: "fire", addHours: 6 }]);
    e.state.location = "beach";
    e.dispatch({ type: "activity", id: "sleep" });
    expect(e.state.stats.energy).toBe(80);
    expect(e.state.log.some((line) => line.text.includes("without a burning fire"))).toBe(true);
  });

  it("a remote shelter cannot protect an exposed bed", () => {
    const e = fresh();
    e.state.regions.beach.discoveries = [];
    e.state.location = "forest";
    e.applyEffects([{ build: "shelter" }]);
    e.state.location = "beach";
    e.applyEffects([{ build: "bed" }, { timer: "fire", addHours: 6 }]);
    e.dispatch({ type: "activity", id: "sleep" });
    expect(e.state.stats.energy).toBe(50);
    expect(e.state.log.some((line) => line.text.includes("without shelter"))).toBe(true);
  });

  it("loads an old bed save without inventing a local fire, and gives the unheated summary", () => {
    const old = fresh().state;
    old.buildings["bed@beach"] = { count: 1, builtAt: 0, batches: [], nextBatch: 1 };
    old.timers = { fire: 0 };
    const e = new Engine(reg, restoreState(old, reg)!);
    expect(e.builtHere("campfire")).toBe(0);
    expect(e.state.timers.fire).toBeUndefined();
    e.dispatch({ type: "activity", id: "sleep" });
    expect(e.state.stats.energy).toBe(80);
    expect(e.state.log.some((line) => line.text.includes("without a burning fire"))).toBe(true);
  });

  it("migrates a legacy burning beach fire without spreading it to another area", () => {
    const old = fresh().state;
    old.timers = { fire: 240 };
    const e = new Engine(reg, restoreState(old, reg)!);
    expect(timerValue(reg, e.state, "fire", "beach")).toBe(240);
    expect(timerValue(reg, e.state, "fire", "forest")).toBe(0);
    expect(e.builtHere("campfire")).toBe(1);
  });
});

describe("better sleep task", () => {
  it("appears after the first night and requires shelter, a bed, and lit fire together here", () => {
    const e = fresh();
    expect(e.state.quests.better_sleep).toBeUndefined();
    e.state.quests.survive_first_night.status = "done";
    e.syncQuests();
    expect(e.state.quests.better_sleep.status).toBe("active");
    expect(view(e).quests.find((q) => q.id === "better_sleep")?.title).toBe("better sleep");
    e.applyEffects([{ build: "bed" }]);
    e.state.location = "forest";
    e.applyEffects([{ build: "campfire" }, { timer: "fire", addHours: 6 }]);
    e.syncQuests();
    expect(e.state.quests.better_sleep.status).toBe("active");
    e.state.location = "beach";
    e.syncQuests();
    expect(e.state.quests.better_sleep.status).toBe("active");
    e.applyEffects([{ build: "campfire" }, { timer: "fire", addHours: 6 }]);
    e.syncQuests();
    expect(e.state.quests.better_sleep.status).toBe("done");
  });
});

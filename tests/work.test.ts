import { describe, expect, it } from "vitest";
import { Engine } from "../src/core/engine";
import { focusShare } from "../src/core/work";
import { restoreState } from "../src/persistence/migrate";
import { loadRegistry, revealAll, startGame } from "./helpers";

function fresh() {
  const reg = loadRegistry();
  const e = revealAll(startGame(reg, 7, "knife", { keepNotes: true }));
  e.state.location = "forest";
  e.state.time = 8 * 60;
  e.state.stats = { health: 100, energy: 100, hunger: 0, thirst: 0 };
  return e;
}

describe("persistent player work", () => {
  it("resumes a serialized action with its inputs reserved once and rewards delivered once", () => {
    const e = fresh();
    e.state.items.stone = 2;
    e.state.items.knife = 0;
    e.start({ type: "menu", menu: "craft" });
    e.start({ type: "choose", choice: "craft_rock_knife" });
    e.stepActions();
    expect(e.state.items.stone).toBe(0);
    expect(e.state.actions[0]).toMatchObject({ completedMinutes: 15, reserved: { stone: 2 } });
    e.state.actions[0].before.items.removed_item = 1;
    const loaded = new Engine(e.reg, restoreState(JSON.parse(JSON.stringify(e.state)), e.reg)!);
    expect(loaded.state.actions[0].before.items.removed_item).toBeUndefined();
    expect(loaded.state.time).toBe(e.state.time);
    for (let i = 0; i < 11; i++) loaded.stepActions();
    expect(loaded.state.items.rock_knife).toBe(1);
    expect(loaded.state.items.stone).toBe(0);
    expect(loaded.state.actions).toEqual([]);
    loaded.stepActions();
    expect(loaded.state.items.rock_knife).toBe(1);
  });

  it("shares focus in one area and restores full speed when the other action finishes", () => {
    const e = fresh();
    e.start({ type: "activity", id: "gather_wood" });
    e.start({ type: "activity", id: "strip_bark" });
    e.stepActions();
    expect(e.state.actions.map((a) => a.completedMinutes)).toEqual([7.5, 7.5]);
    expect(e.state.time).toBe(8 * 60 + 15);
    for (let i = 0; i < 3; i++) e.stepActions();
    expect(e.state.items.firewood).toBeGreaterThan(0);
    expect(e.state.actions[0].completedMinutes).toBe(30);
    e.stepActions();
    expect(e.state.actions[0].completedMinutes).toBe(45);
    expect(focusShare(2, 1.5)).toBe(0.75); // extension point for a future perk
  });

  it("pauses work when travelling away and only resumes it in its own area", () => {
    const e = fresh();
    const job = e.start({ type: "activity", id: "strip_bark" }).workId!;
    e.stepActions();
    e.dispatch({ type: "travel", region: "beach" });
    expect(e.state.actions.find((a) => a.id === job)).toMatchObject({ status: "paused", completedMinutes: 15 });
    expect(e.start({ type: "resume", id: job }).ok).toBe(false);
    e.dispatch({ type: "travel", region: "forest" });
    expect(e.start({ type: "resume", id: job }).ok).toBe(true);
    e.stepActions();
    expect(e.state.actions.find((a) => a.id === job)?.completedMinutes).toBe(30);
  });

  it("sleep advances production time while retaining paused player progress and materials", () => {
    const e = fresh();
    e.applyEffects([{ build: "bed" }, { build: "snares" }]);
    e.applyEffects([{ startCycle: "snares" }]);
    e.state.items.stone = 2;
    e.state.items.knife = 0;
    e.start({ type: "menu", menu: "craft" });
    e.start({ type: "choose", choice: "craft_rock_knife" });
    e.stepActions();
    e.dispatch({ type: "activity", id: "sleep" });
    expect(e.state.time % 1440).toBe(360);
    expect(e.state.actions[0]).toMatchObject({ status: "paused", completedMinutes: 15, reserved: { stone: 2 } });
    expect(e.buildingStepFor("snares")?.step).toBe("collect");
    expect(e.state.items.stone).toBe(0);
  });

  it("keeps live state changes instead of overwriting them with a future snapshot", () => {
    const e = fresh();
    e.start({ type: "activity", id: "gather_wood" });
    e.state.items.stone = 99;
    e.stepActions();
    expect(e.state.items.stone).toBe(99);
  });

  it("uses overnight provisions when sleep interrupts a manually chosen meal", () => {
    const e = fresh();
    e.state.time = 23 * 60 + 45;
    e.state.stats.hunger = 80;
    e.state.items.rations = 4;
    e.start({ type: "consume", item: "rations" });
    e.stepActions();
    expect(e.state.actions[0]).toMatchObject({ status: "paused", reserved: { rations: 1 } });
    expect(e.state.time % 1440).toBe(360);
    expect(e.state.items.rations).toBeLessThan(3);
    expect(e.state.stats.hunger).toBeLessThan(60);
  });

  it("refunds surviving reserved inputs if the action's content was removed", () => {
    const e = fresh();
    e.state.items.stone = 2;
    e.state.items.knife = 0;
    e.start({ type: "menu", menu: "craft" });
    e.start({ type: "choose", choice: "craft_rock_knife" });
    e.stepActions();
    e.reg.recipes.delete("craft_rock_knife");
    const loaded = restoreState(e.state, e.reg)!;
    expect(loaded.items.stone).toBe(2);
    expect(loaded.actions).toEqual([]);
  });
});

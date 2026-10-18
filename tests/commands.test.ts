import { describe, expect, it } from "vitest";
import { prepareCommand } from "../src/core/commands";
import { Engine, type Command } from "../src/core/engine";
import { view } from "../src/core/selectors";
import { loadRegistry, revealAll, startGame } from "./helpers";

const reg = loadRegistry();
function fresh() {
  const e = revealAll(startGame(reg, 7, "knife", { keepNotes: true }));
  e.state.stats = { health: 100, energy: 100, hunger: 0, thirst: 0 };
  return e;
}

function plan(e: Engine, cmd: Command) {
  const expected = new Engine(reg, structuredClone(e.state));
  expected.dispatch(cmd);
  const result = prepareCommand(e, cmd);
  return { result, expected: expected.state };
}

describe("paced browser commands", () => {
  it("advances travel by quarters and arrives only on the last step", () => {
    const e = fresh();
    const start = e.state.time;
    const { result, expected } = plan(e, { type: "travel", region: "forest" });
    expect(result).toMatchObject({ ok: true, stepMs: 2_500, cooldownMs: 5_000 });
    expect(e.state.time).toBe(start);
    expect(e.state.location).toBe("beach");
    expect(result.advance!()).toBe(false);
    expect(e.state.time).toBe(start + 15);
    expect(e.state.location).toBe("beach");
    expect(result.advance!()).toBe(true);
    expect(e.state).toEqual(expected);
    expect(e.state.location).toBe("forest");
    expect(result.advance!()).toBe(true); // completion cannot be applied twice
    expect(e.state).toEqual(expected);
  });

  it.each([
    { menu: "craft", choice: "craft_spear", item: "fishing_spear", ticks: 2 },
    { menu: "build", choice: "bed", building: "bed@beach", ticks: 4 },
  ] as const)("delivers $menu results and notes only when work finishes", (entry) => {
    const e = fresh();
    e.applyEffects([{ give: { timber: 2, firewood: 10 } }]);
    expect(e.dispatch({ type: "menu", menu: entry.menu }).ok).toBe(true);
    const start = e.state.time;
    const { result, expected } = plan(e, { type: "choose", choice: entry.choice });
    expect(result.ok).toBe(true);
    expect(view(e).event).toBeNull();
    expect(e.state.time).toBe(start);
    for (let tick = 1; tick < entry.ticks; tick++) {
      expect(result.advance!()).toBe(false);
      expect(e.state.time).toBe(start + tick * 15);
      if (entry.item) expect(e.state.items[entry.item] ?? 0).toBe(0);
      else expect(e.state.buildings[entry.building!]).toBeUndefined();
      expect(view(e).event).toBeNull();
    }
    expect(result.advance!()).toBe(true);
    expect(e.state).toEqual(expected);
    if (entry.item) expect(e.state.items[entry.item]).toBe(1);
    else {
      expect(e.state.buildings[entry.building!]?.count).toBe(1);
      expect(view(e).event?.title).toBe("Task done: make a bed");
    }
  });

  it("ticks survival and local timers during work, withholding gathered items until completion", () => {
    const e = fresh();
    e.state.location = "forest";
    e.applyEffects([{ build: "campfire" }, { timer: "fire", addHours: 4 }]);
    const thirst = e.state.stats.thirst;
    const { result, expected } = plan(e, { type: "activity", id: "gather_wood" });
    expect(e.state.items.firewood ?? 0).toBe(0);
    expect(result.advance!()).toBe(false);
    expect(e.state.timers["fire@forest"]).toBe(225);
    expect(e.state.stats.thirst).toBeGreaterThan(thirst);
    expect(e.state.items.firewood ?? 0).toBe(0);
    expect(result.advance!()).toBe(true);
    expect(e.state).toEqual(expected);
    expect(e.state.items.firewood).toBeGreaterThan(0);
  });

  it("paces exploration and exposes the discovery on completion", () => {
    const e = startGame(reg, 2, "knife", { keepNotes: true });
    e.dispatch({ type: "explore" });
    const { result, expected } = plan(e, { type: "choose", choice: "forest_edge" });
    expect(view(e).event).toBeNull();
    expect(result.advance!()).toBe(false);
    expect(e.state.regions.forest.unlocked).toBe(false);
    expect(result.advance!()).toBe(true);
    expect(e.state).toEqual(expected);
    expect(e.state.regions.forest.unlocked).toBe(true);
    expect(view(e).event?.id).toBe("explore:beach");
  });

  it("consumes food and finishes an item action at the end of their quarter hour", () => {
    const e = fresh();
    e.state.location = "forest";
    e.applyEffects([{ give: { water_can: 1, shells: 1 } }]);
    for (const cmd of [
      { type: "itemAction", item: "water_can", action: "fill" },
      { type: "consume", item: "shells" },
    ] as const) {
      const start = e.state.time;
      const { result, expected } = plan(e, cmd);
      expect(result.cooldownMs).toBe(2_500);
      expect(e.state.time).toBe(start);
      expect(result.advance!()).toBe(true);
      expect(e.state).toEqual(expected);
    }
  });

  it("keeps sleep and zero-time menus instant", () => {
    const e = fresh();
    const start = e.state.time;
    expect(prepareCommand(e, { type: "menu", menu: "craft" })).toMatchObject({ cooldownMs: 0 });
    expect(e.state.time).toBe(start);
    prepareCommand(e, { type: "choose", choice: "close" });
    e.applyEffects([{ build: "bed" }]);
    const result = prepareCommand(e, { type: "activity", id: "sleep" });
    expect(result).toMatchObject({ ok: true, cooldownMs: 0 });
    expect(result.advance).toBeUndefined();
    expect(e.state.time % 1440).toBe(360);
    expect(e.state.time).toBeGreaterThan(start);
  });

  it("ends interrupted work at the collapse tick, with no real-time wait for overnight sleep", () => {
    const e = fresh();
    e.state.time = 23 * 60 + 45;
    const { result, expected } = plan(e, { type: "travel", region: "forest" });
    expect(result.cooldownMs).toBe(5_000); // duration is an estimate; future collapse is not precomputed
    expect(result.interrupted).toBeUndefined();
    expect(e.state.time).toBe(23 * 60 + 45);
    expect(result.advance!()).toBe(true);
    expect(e.state).toEqual(expected);
    expect(e.state.time).toBe(1800);
    expect(e.state.location).toBe("beach");
  });

  it("reveals death when its simulation step is reached", () => {
    const e = fresh();
    e.state.warmth = reg.bandIds.indexOf("freezing");
    e.state.stats.health = 0.1;
    const { result, expected } = plan(e, { type: "travel", region: "forest" });
    expect(result.cooldownMs).toBe(5_000);
    expect(result.died).toBeUndefined();
    expect(e.state.dead).toBe(false);
    expect(result.advance!()).toBe(true);
    expect(e.state).toEqual(expected);
    expect(e.state.dead).toBe(true);
  });

  it("does not apply pending results over a replaced game state", () => {
    const e = fresh();
    const result = prepareCommand(e, { type: "travel", region: "forest" });
    e.state = fresh().state;
    const replacement = structuredClone(e.state);
    expect(result.advance!()).toBe(true);
    expect(e.state).toEqual(replacement);
  });
});

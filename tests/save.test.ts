import { beforeEach, describe, expect, it } from "vitest";
import { SAVE_VERSION } from "../src/core/state";
import { Engine } from "../src/core/engine";
import { hasSavedGame, loadGame, readSave, saveGame, writeSave } from "../src/persistence/save";
import { loadRegistry, lookAround, startGame } from "./helpers";

const reg = loadRegistry();

// a browser-like localStorage for Node
function fakeStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
}
beforeEach(() => { (globalThis as unknown as { localStorage: unknown }).localStorage = fakeStorage(); });

describe("saving the game", () => {
  it("save stores the game; load brings exactly that game back, after a death too", () => {
    const e = startGame(reg, 1);
    lookAround(e); // the dunes
    expect(hasSavedGame()).toBe(false);
    expect(saveGame(e.state)).toBe(true);
    const savedTime = e.state.time;
    lookAround(e); // the rocks: after the save
    e.state.stats.health = 1;
    e.state.stats.hunger = 100;
    e.state.warmth = reg.bandIds.indexOf("freezing");
    e.advance(1, "work");
    expect(e.state.dead).toBe(true);
    writeSave(e.state); // the autosave keeps the death
    expect(readSave(reg)!.dead).toBe(true);

    expect(hasSavedGame()).toBe(true);
    const back = new Engine(reg, loadGame(reg)!);
    expect(back.state.dead).toBe(false);
    expect(back.state.time).toBe(savedTime);
    expect(back.state.regions.beach.discoveries).toEqual(["forest_edge"]); // the rocks are not found yet
    expect(lookAround(back).ok).toBe(true); // and it plays on
  });

  it("the autosave and the saved game are separate", () => {
    const e = startGame(reg, 2);
    saveGame(e.state);
    lookAround(e);
    writeSave(e.state);
    expect(readSave(reg)!.regions.beach.discoveries).toEqual(["forest_edge"]);
    expect(loadGame(reg)!.regions.beach.discoveries).toEqual([]);
  });

  it("going to sleep is saved just before: willSleep says when", () => {
    const e = startGame(reg, 3);
    lookAround(e); lookAround(e); // dunes, rocks: sleep is there
    const sleep = { type: "activity", id: "sleep" } as const;
    expect(e.willSleep(sleep)).toBe(false); // no local bed
    e.applyEffects([{ give: { firewood: 3 } }]);
    e.applyEffects([{ build: "campfire" }]);
    e.dispatch({ type: "activity", id: "light_fire" });
    expect(e.willSleep(sleep)).toBe(false); // fire alone is insufficient
    e.applyEffects([{ build: "bed" }]);
    expect(e.willSleep(sleep)).toBe(true);
    expect(e.willSleep({ type: "activity", id: "collect_shells" })).toBe(false);
    expect(e.willSleep({ type: "explore" })).toBe(false);
  });

  it("without browser storage nothing breaks", () => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); },
    };
    const e = startGame(reg, 4);
    expect(saveGame(e.state)).toBe(false);
    expect(hasSavedGame()).toBe(false);
    expect(loadGame(reg)).toBeNull();
  });
});

describe("save migration boundary", () => {
  it("repairs removed content references without losing surviving progress", () => {
    const e = startGame(reg, 7);
    e.state.location = "removed_area";
    e.state.items.firewood = 12;
    e.state.items.removed_item = 3;
    e.state.events.active = { id: "removed_event", scene: "start", text: "An old scene." };
    e.state.events.queue = ["removed_event"];
    e.state.regions.beach.discoveries.push("removed_discovery");
    writeSave(e.state);
    const loaded = readSave(reg)!;
    expect(loaded.location).toBe(reg.game.start.region);
    expect(loaded.items.firewood).toBe(12);
    expect(loaded.items.removed_item).toBeUndefined();
    expect(loaded.events.active).toBeNull();
    expect(loaded.events.queue).toEqual([]);
    expect(loaded.regions.beach.discoveries).not.toContain("removed_discovery");
    expect(() => new Engine(reg, loaded).dispatch({ type: "explore" })).not.toThrow();
  });

  it("rejects malformed numeric state and retains the original stored save", () => {
    const e = startGame(reg, 7);
    const bad = JSON.stringify({ saveVersion: 2, current: { ...e.state, items: { firewood: -4 } } });
    localStorage.setItem("textisland.save", bad);
    expect(readSave(reg)).toBeNull();
    expect(localStorage.getItem("textisland.save")).toBe(bad);
  });

  it("upgrades version 1 defaults and drops a missing scene from a surviving event", () => {
    const e = startGame(reg, 7);
    const old = { ...e.state, saveVersion: 1, today: undefined, lastText: undefined, buildings: undefined };
    old.events.active = { id: [...reg.events.keys()][0], scene: "removed_scene", text: "Old." };
    localStorage.setItem("textisland.save", JSON.stringify({ saveVersion: 1, current: old }));
    const loaded = readSave(reg)!;
    expect(loaded.saveVersion).toBe(SAVE_VERSION);
    expect(loaded.today).toEqual({});
    expect(loaded.buildings).toEqual({});
    expect(loaded.events.active).toBeNull();
  });
});

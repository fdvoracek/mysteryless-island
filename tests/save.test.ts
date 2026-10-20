import { beforeEach, describe, expect, it } from "vitest";
import { SAVE_VERSION } from "../src/core/state";
import { restoreState } from "../src/persistence/migrate";
import { Engine } from "../src/core/engine";
import { hasSavedGame, loadGame, readSave, readSaveStatus, saveGame, writeSave } from "../src/persistence/save";
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
    e.state.buildings["removed_building@forest"] = { count: 1, builtAt: e.state.time, batches: [], nextBatch: 1 };
    e.state.quests.removed_quest = { status: "active", startedAt: e.state.time };
    e.state.events.active = { kind: "event", event: "removed_event", scene: "start", text: "An old scene." };
    e.state.events.queue = ["removed_event"];
    e.state.regions.beach.discoveries.push("removed_discovery");
    writeSave(e.state);
    const loaded = readSave(reg)!;
    expect(loaded.location).toBe(reg.game.start.region);
    expect(loaded.items.firewood).toBe(12);
    expect(loaded.items.removed_item).toBeUndefined();
    expect(loaded.buildings["removed_building@forest"]).toBeUndefined();
    expect(loaded.quests.removed_quest).toBeUndefined();
    expect(loaded.events.active).toBeNull();
    expect(loaded.events.queue).toEqual([]);
    expect(loaded.regions.beach.discoveries).not.toContain("removed_discovery");
    expect(() => new Engine(reg, loaded).dispatch({ type: "explore" })).not.toThrow();
  });

  it("rejects malformed numeric state and retains the original stored save", () => {
    const e = startGame(reg, 7);
    const bad = JSON.stringify({ saveVersion: SAVE_VERSION, current: { ...e.state, items: { firewood: -4 } } });
    localStorage.setItem("textisland.save", bad);
    localStorage.setItem("textisland.saved", bad);
    expect(hasSavedGame()).toBe(false);
    expect(loadGame(reg)).toBeNull();
    expect(readSave(reg)).toBeNull();
    expect(localStorage.getItem("textisland.save")).toBe(bad);
  });

  it.each([1, 3, 5, 6])("rejects version %s without changing either save slot", (version) => {
    const e = startGame(reg, 7);
    const { technology: _technology, ...legacy } = e.state;
    const current = { ...legacy, saveVersion: version };
    const raw = JSON.stringify({ saveVersion: version, current });
    for (const key of ["textisland.save", "textisland.saved"]) localStorage.setItem(key, raw);
    expect(readSaveStatus(reg)).toMatchObject({ state: null, error: expect.stringContaining("Start a new game") });
    expect(loadGame(reg)).toBeNull();
    expect(hasSavedGame()).toBe(false);
    expect(restoreState(current, reg)).toBeNull();
    for (const key of ["textisland.save", "textisland.saved"]) expect(localStorage.getItem(key)).toBe(raw);
  });

  it.each([[6, SAVE_VERSION], [SAVE_VERSION, 6], [SAVE_VERSION, SAVE_VERSION + 1]])(
    "checks envelope version %s and inner version %s independently", (outer, inner) => {
      const e = startGame(reg, 7);
      const raw = JSON.stringify({ saveVersion: outer, current: { ...e.state, saveVersion: inner } });
      for (const key of ["textisland.save", "textisland.saved"]) localStorage.setItem(key, raw);
      expect(readSave(reg)).toBeNull();
      expect(loadGame(reg)).toBeNull();
      expect(hasSavedGame()).toBe(false);
      expect(localStorage.getItem("textisland.save")).toBe(raw);
    },
  );

  it("roundtrips a fresh state with both random streams unchanged", () => {
    const e = startGame(reg, 7);
    writeSave(e.state);
    expect(readSave(reg)).toEqual(e.state);
    expect(readSave(reg)!.saveVersion).toBe(SAVE_VERSION);
  });

  it("preserves paused work, reservations, production and chosen methods", () => {
    const e = startGame(reg, 7);
    e.state.actions.push({
      id: "work:1", owner: "player", location: "beach", label: "making a knife",
      toolRequirements: { all: [{ tool: "sharp" }, { any: [true, { not: { tool: "fire_starter" } }] }] },
      work: { kind: "craft", recipe: "craft_rock_knife", way: 0 },
      requiredMinutes: 60, completedMinutes: 20, effort: "work", status: "paused",
      reserved: { stone: 2 }, eventKeys: [], damageLogged: [],
      before: { items: { stone: 3 }, unlocked: ["beach"], location: "beach", possible: [], built: [] },
    });
    e.state.buildings["fish_trap@beach"] = {
      count: 1, builtAt: 0, nextBatch: 2,
      batches: [{ id: 1, units: 1, startedAt: 0, inputs: {} }],
    };
    writeSave(e.state);
    const loaded = readSave(reg)!;
    expect(loaded.actions).toEqual(e.state.actions);
    expect(loaded.buildings).toEqual(e.state.buildings);
    expect(loaded.rng).toEqual(e.state.rng);
    expect(loaded.narrativeRng).toEqual(e.state.narrativeRng);
    for (const toolRequirements of [undefined, "sharp", { tool: 7 }, { all: [{ unknown: true }] }, { not: null }]) {
      const malformed = { ...e.state, actions: [{ ...e.state.actions[0], toolRequirements }] };
      const raw = JSON.stringify({ saveVersion: SAVE_VERSION, current: malformed });
      localStorage.setItem("textisland.save", raw);
      expect(readSave(reg)).toBeNull();
      expect(localStorage.getItem("textisland.save")).toBe(raw);
    }
  });

  it("refunds surviving reserved materials when a work definition disappears", () => {
    const e = startGame(reg, 7);
    e.state.items.firewood = 4;
    e.state.actions.push({
      id: "work:1", owner: "player", toolRequirements: true, location: "beach", label: "old work",
      work: { kind: "activity", id: "removed_activity" },
      requiredMinutes: 60, completedMinutes: 20, effort: "work", status: "paused",
      reserved: { firewood: 2, removed_item: 3 }, eventKeys: [], damageLogged: [],
      before: { items: {}, unlocked: [], location: "beach", possible: [], built: [] },
    });
    writeSave(e.state);
    const loaded = readSave(reg)!;
    expect(loaded.actions).toEqual([]);
    expect(loaded.items.firewood).toBe(6);
    expect(loaded.items.removed_item).toBeUndefined();
    writeSave(loaded);
    expect(readSave(reg)!.items.firewood).toBe(6);
  });

  it("keeps permanent unlock history across changed prerequisite edges", () => {
    const e = startGame(reg, 7);
    const tree = reg.trees.get("craft")!;
    const target = [...tree.nodes.values()].find((node) => node.after.length > 0)!;
    e.state.technology.craft.unlocked.push(target.target, "removed_node");
    e.state.technology.craft.completed.push("removed_node");
    writeSave(e.state);
    const edited = { ...reg, trees: new Map(reg.trees) };
    edited.trees.set("craft", { ...tree, nodes: new Map(tree.nodes) });
    const newParent = [...tree.nodes.values()].find((node) =>
      node.target !== target.target && !target.after.includes(node.target)
      && !node.after.includes(target.target))!;
    edited.trees.get("craft")!.nodes.set(target.target, { ...target, after: [...target.after, newParent.target] });
    const loaded = readSave(edited)!;
    expect(loaded.technology.craft.unlocked).toContain(target.target);
    expect(loaded.technology.craft.unlocked).not.toContain("removed_node");
    expect(loaded.technology.craft.completed).toEqual([]);
    expect(loaded.technology.build).toEqual(e.state.technology.build);
  });

  it.each([undefined, { craft: { completed: [], unlocked: [] } }, {
    craft: { completed: [3], unlocked: [] }, build: { completed: [], unlocked: [] },
  }])("rejects missing or malformed personal progression", (technology) => {
    const e = startGame(reg, 7);
    expect(restoreState({ ...e.state, technology }, reg)).toBeNull();
  });

  it("drops a missing scene from a surviving event", () => {
    const e = startGame(reg, 7);
    e.state.events.active = { kind: "event", event: [...reg.events.keys()][0], scene: "removed_scene", text: "Old." };
    writeSave(e.state);
    expect(readSave(reg)!.events.active).toBeNull();
  });
});

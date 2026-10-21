import { describe, expect, it } from "vitest";
import { Engine } from "../src/core/engine";
import { buildingState, batchesReady } from "../src/core/conditions";
import { collections, idleUnits, startProduction } from "../src/core/production";
import { restoreState } from "../src/persistence/migrate";
import { buildRegistry } from "../src/content/registry";
import { contentProblems, loadRegistry, readContentFiles, revealAll, startGame } from "./helpers";

const reg = loadRegistry();
function fresh() {
  const e = revealAll(startGame(reg, 12));
  e.state.time = 8 * 60;
  e.state.stats = { health: 100, energy: 100, hunger: 0, thirst: 0 };
  return e;
}
const collect = (e: Engine, id: string) => e.dispatch({ type: "building", id, step: "collect" });

describe("local production batches", () => {
  it("locks actual food inputs and keeps different rack outputs independent across places and reload", () => {
    const e = fresh();
    e.applyEffects([{ build: "drying_rack" }, { give: { raw_meat: 2 } }]);
    expect(e.dispatch({ type: "itemAction", item: "raw_meat", action: "dry" }).ok).toBe(true);
    expect(e.state.items.raw_meat).toBe(0);
    expect(e.state.buildings["drying_rack@beach"].batches[0]).toMatchObject({ inputs: { raw_meat: 2 }, production: "meat" });
    e.state.location = "meadows";
    e.applyEffects([{ build: "drying_rack" }, { give: { raw_fish: 2 } }]);
    expect(e.dispatch({ type: "building", id: "drying_rack", step: "start" }).ok).toBe(true);
    expect(e.state.buildings["drying_rack@meadows"].batches[0].inputs).toEqual({ raw_fish: 2 });
    // Deterministic clock progress on reload, with no wall-clock advancement.
    const restored = restoreState(JSON.parse(JSON.stringify(e.state)), reg)!;
    expect(restored.time).toBe(e.state.time);
    const loaded = new Engine(reg, restored);
    loaded.state.time += 720;
    expect(collect(loaded, "drying_rack").ok).toBe(true);
    expect(loaded.state.items.dried_fish).toBe(2);
    expect(loaded.state.items.dried_meat ?? 0).toBe(0);
    loaded.state.location = "beach";
    expect(collect(loaded, "drying_rack").ok).toBe(true);
    expect(loaded.state.items.dried_meat).toBe(2);
    expect(loaded.state.flags).not.toContain("drying_meat");
  });

  it("new unbaited traps join the local clock immediately without changing another area's cycle", () => {
    const e = fresh();
    e.applyEffects([{ build: "fish_trap" }, { startCycle: "fish_trap" }]);
    const beach = e.state.buildings["fish_trap@beach"];
    e.state.time += 120;
    e.applyEffects([{ build: "fish_trap" }]);
    expect(beach.batches).toHaveLength(1);
    expect(beach.batches[0]).toMatchObject({ units: 2, startedAt: 480, inputs: {} });
    e.state.location = "meadows";
    e.applyEffects([{ build: "fish_trap" }, { startCycle: "fish_trap" }]);
    expect(batchesReady(reg, e.state, "fish_trap", "meadows")).toBe(0);
    expect(batchesReady(reg, e.state, "fish_trap", "beach")).toBe(1);
    e.state.location = "beach";
    expect(collect(e, "fish_trap").ok).toBe(true);
    expect(e.state.items.raw_fish).toBe(2);
    expect(beach.batches[0].units).toBe(2);
    expect(beach.batches[0].startedAt).toBe(e.state.time);
  });

  it("input-bearing units keep separate clocks and unplanted units produce nothing", () => {
    const e = fresh();
    e.state.location = "meadows";
    e.applyEffects([{ build: "corn_field" }, { startCycle: "corn_field" }]);
    const field = e.state.buildings["corn_field@meadows"];
    const firstStart = field.batches[0].startedAt;
    e.state.time += 72 * 60;
    e.applyEffects([{ build: "corn_field" }]);
    expect(idleUnits(field)).toBe(1);
    expect(field.batches[0].units).toBe(1);
    // A second planting has its own full duration and locked input identity.
    startProduction(field, e.state.time, 1, { corn: 2 });
    expect(field.batches.map((b) => b.startedAt)).toEqual([firstStart, e.state.time]);
    expect(collections(reg.buildings.get("corn_field")!, field, e.state.time)).toEqual([{ id: 1, units: 1, batches: 1 }]);
    expect(e.stepCost("corn_field", "collect").hours).toBe(reg.buildings.get("corn_field")!.cycle!.collect.hours);
    expect(collect(e, "corn_field").ok).toBe(true);
    expect(field.batches).toHaveLength(1);
    expect(field.batches[0]).toMatchObject({ id: 2, units: 1, inputs: { corn: 2 } });
    expect(idleUnits(field)).toBe(1);
    expect(buildingState(reg, e.state, "corn_field", "meadows")).toBe("working");
    expect(e.buildingStepFor("corn_field")?.step).toBe("start");
    expect(batchesReady(reg, e.state, "corn_field", "meadows")).toBe(0);
  });

  it("a trap added during paused collection keeps its uncollected share", () => {
    const e = fresh();
    e.applyEffects([{ build: "fish_trap" }, { startCycle: "fish_trap" }]);
    e.state.time += 120;
    expect(e.start({ type: "building", id: "fish_trap", step: "collect" }).ok).toBe(true);
    e.applyEffects([{ build: "fish_trap" }]);
    e.stepActions();
    const st = e.state.buildings["fish_trap@beach"];
    expect(st.batches).toHaveLength(2);
    expect(st.batches.map((b) => b.units)).toEqual([1, 1]);
    expect(e.state.items.raw_fish).toBe(1);
    expect(batchesReady(reg, e.state, "fish_trap", "beach")).toBe(1);
  });

  it("requires a fresh game for version-5 production instead of inventing personal history", () => {
    const old = structuredClone(fresh().state);
    old.saveVersion = 5;
    expect(restoreState(old, reg)).toBeNull();
  });

  it("rejects invalid batch identities and overallocated units at the save boundary", () => {
    const e = fresh();
    e.applyEffects([{ build: "fish_trap" }, { startCycle: "fish_trap" }]);
    const old = structuredClone(e.state);
    old.buildings["fish_trap@beach"].batches[0].units = 2;
    expect(restoreState(old, reg)).toBeNull();
    old.buildings["fish_trap@beach"].batches[0].units = 1;
    old.buildings["fish_trap@beach"].nextBatch = 1;
    expect(restoreState(old, reg)).toBeNull();
  });

  it("validates named outputs and their item references", () => {
    const files = readContentFiles();
    const items = structuredClone(files["content/items/basics.json"]) as any[];
    items.find((i) => i.id === "raw_meat").actions[0].effects[0].production = "missing";
    files["content/items/basics.json"] = items;
    const buildings = structuredClone(files["content/buildings/camp.json"]) as any[];
    buildings.find((b) => b.id === "drying_rack").cycle.products.meat[0].item = "missing_item";
    files["content/buildings/camp.json"] = buildings;
    const problems = contentProblems(() => buildRegistry(files));
    expect(problems).toMatch(/unknown production "missing"/);
    expect(problems).toMatch(/unknown item "missing_item"/);
  });
});

it("preserves a collection's original batch and unit claim after saving a long pause", () => {
  const e = fresh();
  e.applyEffects([{ build: "fish_trap" }, { startCycle: "fish_trap" }]);
  e.state.time += 120;
  e.start({ type: "building", id: "fish_trap", step: "collect" });
  e.applyEffects([{ build: "fish_trap" }]);
  e.state.time += 240;
  const loaded = new Engine(reg, restoreState(structuredClone(e.state), reg)!);
  expect(loaded.state.actions[0].work).toMatchObject({ collections: [{ id: 1, units: 1, batches: 1 }] });
  loaded.stepActions();
  expect(loaded.state.items.raw_fish).toBe(1);
  expect(batchesReady(reg, loaded.state, "fish_trap", "beach")).toBe(3);
});

it("reconciles collection claims when installed content lowers the number of surviving units", () => {
  const e = fresh();
  e.applyEffects([{ build: "fish_trap" }, { build: "fish_trap" }, { startCycle: "fish_trap" }]);
  e.state.time += 120;
  e.start({ type: "building", id: "fish_trap", step: "collect" });
  const files = readContentFiles();
  const buildings = structuredClone(files["content/buildings/camp.json"]) as any[];
  buildings.find((b) => b.id === "fish_trap").max = 1;
  files["content/buildings/camp.json"] = buildings;
  const changed = buildRegistry(files);
  const loaded = new Engine(changed, restoreState(e.state, changed)!);
  expect(loaded.state.actions[0].work).toMatchObject({ collections: [{ units: 1, batches: 1 }] });
  loaded.stepActions();
  loaded.stepActions();
  expect(loaded.state.items.raw_fish).toBe(1);
});

it("sowing a newly built field does not fill other empty fields without their seeds", () => {
  const e = fresh();
  e.state.location = "meadows";
  e.applyEffects([{ build: "corn_field" }, { build: "corn_field" }]);
  // The build effect explicitly plants its one new unit with the build action's reserved seeds.
  e.applyEffects(reg.buildings.get("corn_field")!.build.effects, { corn: 2 });
  const field = e.state.buildings["corn_field@meadows"];
  expect(field.batches).toHaveLength(1);
  expect(field.batches[0]).toMatchObject({ units: 1, inputs: { corn: 2 } });
  expect(idleUnits(field)).toBe(1);
});

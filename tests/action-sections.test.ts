import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/content/registry";
import { view } from "../src/core/selectors";
import { loadRegistry, readContentFiles, revealAll, startGame } from "./helpers";

const reg = loadRegistry();
const fresh = () => revealAll(startGame(reg, 7));

describe("action sections", () => {
  it("keeps craft and build beside look around, above gathering", () => {
    const e = fresh();
    e.applyEffects([{ build: "campfire" }, { build: "bed" }]);
    const v = view(e);
    expect(v.environmentActions.map((a) => a.id)).toEqual(["explore:beach", "collect_shells", "collect_stones", "catch_fish"]);
    expect(v.buildings.find((b) => b.id === "bed")?.actions.map((a) => a.id)).toEqual(["sleep"]);
    expect(v.buildings.find((b) => b.id === "campfire")?.actions.map((a) => a.id)).toEqual(["light_fire"]);
  });

  it("groups cooking, drying, and production with their local buildings", () => {
    const e = fresh();
    e.applyEffects([{ build: "campfire" }, { build: "drying_rack" }, { build: "fish_trap" },
      { timer: "fire", addHours: 6 }, { give: { raw_fish: 2, raw_meat: 2 } }]);
    const v = view(e);
    expect(v.buildings.find((b) => b.id === "campfire")?.actions.map((a) => a.label)).toEqual(["stoke fire", "cook raw fish", "cook raw meat"]);
    expect(v.buildings.find((b) => b.id === "drying_rack")?.actions.map((a) => a.label)).toEqual(["hang fish", "dry raw meat"]);
    expect(v.buildings.find((b) => b.id === "fish_trap")?.actions.map((a) => a.label)).toEqual(["set"]);
    const controls = [...v.environmentActions, ...v.buildings.flatMap((b) => b.actions), ...v.consumables.flatMap((i) => i.actions)];
    expect(new Set(controls.map((a) => a.id)).size).toBe(controls.length);
    expect(v.consumables.map((i) => i.id)).toContain("raw_meat");
    const cook = v.buildings.find((b) => b.id === "campfire")!.actions.find((a) => a.label === "cook raw fish")!;
    expect(e.dispatch(cook.command).ok).toBe(true);
    expect(e.state.items.cooked_fish).toBe(1);
  });

  it("keeps actionable items in consumables and all other possessions in inventory", () => {
    const e = fresh();
    e.state.location = "forest";
    e.applyEffects([{ give: { water_can: 1, cooked_fish: 1, can_water: 1, fishing_spear: 1, stone: 2, firewood: 3 } }]);
    const v = view(e);
    expect(v.inventory.find((i) => i.id === "knife")).toMatchObject({ tags: ["sharp"], actions: [] });
    expect(v.inventory.find((i) => i.id === "fishing_spear")).toMatchObject({ count: 1 });
    expect(v.consumables.find((i) => i.id === "water_can")?.actions.map((a) => a.label)).toEqual(["fill"]);
    const fish = v.consumables.find((i) => i.id === "cooked_fish")!;
    expect(v.inventory.map((i) => i.id)).toEqual(["firewood", "fishing_spear", "knife", "matches", "stone", "summer_clothes"]);
    expect(v.consumables.map((i) => i.id).sort()).toEqual(["can_water", "cooked_fish", "water_can"]);
    expect(v.inventory.some((i) => v.consumables.some((c) => c.id === i.id))).toBe(false);
    expect(fish.actions[0].command).toEqual({ type: "consume", item: "cooked_fish" });
    expect(v.consumables.find((i) => i.id === "can_water")?.actions[0].label).toBe("drink");
    expect(e.dispatch(fish.actions[0].command).ok).toBe(true);
    expect(e.state.items.cooked_fish ?? 0).toBe(0);
  });

  it("keeps actionable items in consumables even when their actions are unavailable here", () => {
    const e = fresh();
    e.applyEffects([{ give: { water_can: 1, raw_fish: 1 } }]);
    const v = view(e);
    for (const id of ["water_can", "raw_fish"]) {
      expect(v.consumables.find((i) => i.id === id)?.actions).toEqual([]);
      expect(v.inventory.some((i) => i.id === id)).toBe(false);
    }
  });

  it("changes building controls with location without borrowing a remote fire or bed", () => {
    const e = fresh();
    e.applyEffects([{ build: "campfire" }, { build: "bed" }, { timer: "fire", addHours: 6 }, { give: { raw_fish: 1 } }]);
    expect(view(e).buildings.map((b) => b.id)).toEqual(["bed", "campfire"]);
    e.state.location = "forest";
    const v = view(e);
    expect(v.buildings).toEqual([]);
    expect(v.environmentActions.some((a) => a.id === "sleep" || a.id === "stoke_fire")).toBe(false);
    expect(v.consumables.flatMap((i) => i.actions).some((a) => a.label.includes("cook"))).toBe(false);
    expect(v.environmentActions.some((a) => a.id === "gather_wood")).toBe(true);
  });

  it("validates building ownership references for activities and item actions", () => {
    for (const kind of ["activity", "item"]) {
      const files = readContentFiles();
      if (kind === "activity") (files["content/regions/beach.json"] as { activities: { building?: string }[] }).activities[0].building = "missing_camp";
      else (files["content/items/raw_fish.json"] as { actions: { building?: string }[] }).actions[0].building = "missing_camp";
      expect(() => buildRegistry(files)).toThrow(/missing_camp/);
    }
  });
});

import { describe, expect, it } from "vitest";
import { buildRegistry, ContentError } from "../src/content/registry";
import type { Engine } from "../src/core/engine";
import { view } from "../src/core/selectors";
import { loadRegistry, lookAround, readContentFiles, startGame } from "./helpers";

const reg = loadRegistry();
const choose = (e: Engine, choice: string) => e.dispatch({ type: "choose", choice });
const explore = (e: Engine, id: string) => { e.dispatch({ type: "explore" }); choose(e, id); choose(e, "close"); };
const labels = (e: Engine) => view(e).actions.map((a) => a.label);
const unknownCells = (e: Engine) => view(e).map.unknown;

/** beach: rocks, cliff, then the climb (the forest stays a "?") */
function toCliffTop(seed: number, choice: "knife" | "water" = "knife") {
  const e = startGame(reg, seed, choice);
  for (const id of ["rock_shelter", "cliff_shells", "cliff_top"]) explore(e, id);
  return e;
}

describe("the meadows: seen from the cliff top, west of the beach, an hour away", () => {
  it("are not on the map at first; the cliff shows a ? to the west; climbing it opens them", () => {
    const e = startGame(reg, 1);
    expect(unknownCells(e)).toEqual([{ col: 1, row: 0 }]); // only the forest's ?
    explore(e, "rock_shelter");
    e.dispatch({ type: "explore" });
    expect(view(e).event!.choices.map((c) => c.id)).not.toContain("cliff_top"); // not before the cliff is found
    choose(e, "close");
    explore(e, "cliff_shells");
    expect(unknownCells(e)).toEqual([{ col: 2, row: 0 }, { col: 0, row: 0 }]); // forest (right), meadows (left)
    expect(view(e).tabs.find((t) => t.here)).toMatchObject({ id: "beach", col: 1 });
    e.dispatch({ type: "explore" });
    expect(view(e).event!.text).toContain("The cliff above them looks climbable.");
    expect(view(e).event!.choices.find((c) => c.id === "cliff_top")).toMatchObject({ label: "climb the cliff", time: "30m" });
    choose(e, "cliff_top");
    const found = view(e).event!;
    expect(found.text).toMatch(/Meadows, an hour's walk away\./);
    expect(found.choices).toEqual([
      { id: "go:meadows", label: "go to the meadows", enabled: true, time: "1h" },
      { id: "close", label: "close", enabled: true },
    ]);
    choose(e, "close");
    expect(view(e).tabs.map((t) => [t.id, t.col])).toEqual([["beach", 1], ["meadows", 0]]);
    expect(view(e).map.paths).toContainEqual({ from: { col: 1, row: 0 }, to: { col: 0, row: 0 }, unknown: false, label: "1h" });
  });

  it("the walk takes an hour; the first visit describes them; from the forest it is 1.5 hours", () => {
    const e = toCliffTop(2);
    const t0 = e.state.time;
    e.dispatch({ type: "travel", region: "meadows" });
    expect(e.state.time - t0).toBe(60);
    expect(e.state.log[0].text).toMatch(/willows/);
    expect(labels(e)).toEqual(["look around"]);
    e.dispatch({ type: "travel", region: "beach" });
    explore(e, "forest_edge");
    e.dispatch({ type: "travel", region: "forest" });
    const t1 = e.state.time;
    e.dispatch({ type: "travel", region: "meadows" });
    expect(e.state.time - t1).toBe(90);
  });

  it("the bushes: pick berries (food, eaten raw)", () => {
    const e = toCliffTop(3);
    e.dispatch({ type: "travel", region: "meadows" });
    explore(e, "berry_bushes");
    expect(labels(e)).toEqual(["look around", "pick berries"]);
    e.dispatch({ type: "activity", id: "collect_berries" });
    const n = e.state.items.berries;
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(6);
    const hunger = e.state.stats.hunger;
    e.dispatch({ type: "consume", item: "berries" });
    expect(e.state.items.berries).toBe(n - 1);
    expect(e.state.stats.hunger).toBeLessThan(hunger);
  });

  it("the river: drink, fill the water can, and fish with a spear (it also starts the spear task)", () => {
    const e = toCliffTop(4, "water");
    e.dispatch({ type: "travel", region: "meadows" });
    lookAround(e); // the bushes
    lookAround(e); // the willows: the river
    expect(labels(e)).toEqual(["look around", "pick berries", "drink water", "catch fish"]);
    expect(view(e).actions[0].badge).toBeUndefined();
    expect(view(e).quests.map((q) => q.id)).toContain("build_fishing_spear");
    const fish = view(e).actions.find((a) => a.label === "catch fish")!;
    expect(fish.enabled).toBe(false); // no spear yet
    e.state.stats.thirst = 60;
    e.dispatch({ type: "activity", id: "drink_river" });
    expect(e.state.stats.thirst).toBeLessThan(60);
    e.state.items.can_water = 1;
    expect(e.dispatch({ type: "itemAction", item: "water_can", action: "fill_river" }).ok).toBe(true);
    expect(e.state.items.can_water).toBe(4);
    e.applyEffects([{ give: { fishing_spear: 1 } }]);
    e.state.time = 9 * 60 + 24 * 60 * Math.floor(e.state.time / (24 * 60)); // daylight
    expect(e.dispatch({ type: "activity", id: "catch_river_fish" }).ok).toBe(true);
  });

  it("the forest spring's 'fill' does not show at the river, nor the river's at the spring", () => {
    const e = toCliffTop(5, "water");
    e.dispatch({ type: "travel", region: "meadows" });
    lookAround(e); lookAround(e);
    e.state.items.can_water = 1;
    expect(e.dispatch({ type: "itemAction", item: "water_can", action: "fill" }).ok).toBe(false);
  });

  it("the validator checks hintWhen", () => {
    const files = readContentFiles();
    const m = structuredClone(files["content/regions/meadows.json"]) as { hintWhen: unknown };
    m.hintWhen = { discovered: "atlantis" };
    files["content/regions/meadows.json"] = m;
    expect(() => buildRegistry(files)).toThrow(ContentError);
    try { buildRegistry(files); } catch (err) {
      expect((err as ContentError).problems.join("\n")).toMatch(/region meadows\.hintWhen: unknown discovery "atlantis"/);
    }
  });
});

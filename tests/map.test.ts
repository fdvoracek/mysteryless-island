import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/content/registry";
import { view } from "../src/core/selectors";
import { loadRegistry, lookAround, readContentFiles, startGame } from "./helpers";

const reg = loadRegistry();

describe("the route map (the places panel)", () => {
  it("at the start: only the beach, and dashed paths to the places not found yet (the forest east, the meadows west)", () => {
    const v = view(startGame(reg, 1));
    expect(v.tabs).toEqual([{ id: "beach", label: "the beach", here: true, hours: 0, col: 1, row: 0, icons: [] }]);
    expect(v.map).toEqual({
      cols: 3, rows: 1,
      unknown: [{ col: 2, row: 0 }, { col: 0, row: 0 }],
      paths: [
        { from: { col: 1, row: 0 }, to: { col: 2, row: 0 }, unknown: true, label: undefined },
        { from: { col: 1, row: 0 }, to: { col: 0, row: 0 }, unknown: true, label: undefined },
      ],
    });
  });

  it("a found place joins the map, with the walking time on its path", () => {
    const e = startGame(reg, 2);
    lookAround(e); // the dunes: the forest
    const v = view(e);
    expect(v.tabs.map((t) => [t.id, t.col, t.here])).toEqual([["beach", 1, true], ["forest", 2, false]]);
    expect(v.tabs[1].hours).toBe(0.5);
    expect(v.map.unknown).toEqual([{ col: 0, row: 0 }]);
    expect(v.map.paths[0]).toEqual({ from: { col: 1, row: 0 }, to: { col: 2, row: 0 }, unknown: false, label: "30m" });
    e.dispatch({ type: "travel", region: "forest" });
    expect(view(e).tabs.map((t) => t.here)).toEqual([false, true]);
  });

  it("places sit where their map position says; without one they line up by order", () => {
    const files = readContentFiles();
    const forest = structuredClone(files["content/regions/forest.json"]) as { map?: unknown };
    forest.map = { x: 0, y: -1 }; // north of the beach
    files["content/regions/forest.json"] = forest;
    const north = view(startGame(buildRegistry(files), 3)).map;
    expect(north).toMatchObject({ cols: 2, rows: 2, unknown: [{ col: 1, row: 0 }, { col: 0, row: 1 }] });
    delete forest.map;
    const beach = structuredClone(files["content/regions/beach.json"]) as { map?: unknown };
    delete beach.map;
    files["content/regions/beach.json"] = beach;
    const meadows = structuredClone(files["content/regions/meadows.json"]) as { map?: unknown };
    delete meadows.map;
    files["content/regions/meadows.json"] = meadows;
    const row = view(startGame(buildRegistry(files), 3)).map;
    expect(row).toMatchObject({ cols: 3, rows: 1, unknown: [{ col: 1, row: 0 }, { col: 2, row: 0 }] });
  });

  it("a place can stay off the map until its hintWhen holds (then a ?, until it opens)", () => {
    const files = readContentFiles();
    const meadows = structuredClone(files["content/regions/meadows.json"]) as { hintWhen?: unknown };
    meadows.hintWhen = { discovered: "cliff_shells" };
    files["content/regions/meadows.json"] = meadows;
    const e = startGame(buildRegistry(files), 4);
    expect(view(e).map).toMatchObject({ cols: 2, unknown: [{ col: 1, row: 0 }] }); // only the forest
    lookAround(e); lookAround(e); lookAround(e); // dunes, rocks, cliff
    expect(view(e).map).toMatchObject({ cols: 3, unknown: [{ col: 0, row: 0 }] });
  });

  it("hovering a place shows icons for what you have found there (each kind once)", () => {
    const e = startGame(reg, 5);
    const icons = (id: string) => view(e).tabs.find((t) => t.id === id)!.icons;
    expect(icons("beach")).toEqual([]);
    lookAround(e); lookAround(e); // dunes, rocks: fire and sleep
    expect(icons("beach")).toEqual(["fire", "sleep"]);
    expect(icons("forest")).toEqual(["wood"]); // wood from the start, the spring not found yet
    lookAround(e); lookAround(e); // cliff (shells), shallows (fish)
    expect(icons("beach")).toEqual(["fire", "fish", "shells", "sleep"]);
    e.applyEffects([{ give: { firewood: 3 } }]);
    e.dispatch({ type: "activity", id: "light_fire" });
    expect(icons("beach")).toEqual(["fire", "fish", "shells", "sleep"]); // stoke fire: still one fire
    e.dispatch({ type: "travel", region: "forest" });
    lookAround(e);
    expect(icons("forest")).toEqual(["water", "wood"]);
  });
});

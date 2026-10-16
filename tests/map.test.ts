import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/content/registry";
import { view } from "../src/core/selectors";
import { loadRegistry, lookAround, readContentFiles, startGame } from "./helpers";

const reg = loadRegistry();

describe("the route map (the places panel)", () => {
  it("at the start: only the beach, and a dashed path to a place not found yet", () => {
    const v = view(startGame(reg, 1));
    expect(v.tabs).toEqual([{ id: "beach", label: "the beach", here: true, hours: 0, col: 0, row: 0 }]);
    expect(v.map).toEqual({
      cols: 2, rows: 1,
      unknown: [{ col: 1, row: 0 }],
      paths: [{ from: { col: 0, row: 0 }, to: { col: 1, row: 0 }, unknown: true, label: undefined }],
    });
  });

  it("a found place joins the map, with its walking time", () => {
    const e = startGame(reg, 2);
    lookAround(e); // the dunes: the forest
    const v = view(e);
    expect(v.tabs.map((t) => [t.id, t.col, t.here])).toEqual([["beach", 0, true], ["forest", 1, false]]);
    expect(v.tabs[1].hours).toBe(0.5);
    expect(v.map.unknown).toEqual([]);
    expect(v.map.paths).toEqual([{ from: { col: 0, row: 0 }, to: { col: 1, row: 0 }, unknown: false }]);
    e.dispatch({ type: "travel", region: "forest" });
    expect(view(e).tabs.map((t) => t.here)).toEqual([false, true]);
  });

  it("places sit where their map position says; without one they line up by order", () => {
    const files = readContentFiles();
    const forest = structuredClone(files["content/regions/forest.json"]) as { map?: unknown };
    forest.map = { x: 0, y: -1 }; // north of the beach
    files["content/regions/forest.json"] = forest;
    const north = view(startGame(buildRegistry(files), 3)).map;
    expect(north).toMatchObject({ cols: 1, rows: 2, unknown: [{ col: 0, row: 0 }] });
    delete forest.map;
    const beach = structuredClone(files["content/regions/beach.json"]) as { map?: unknown };
    delete beach.map;
    files["content/regions/beach.json"] = beach;
    const row = view(startGame(buildRegistry(files), 3)).map;
    expect(row).toMatchObject({ cols: 2, rows: 1, unknown: [{ col: 1, row: 0 }] });
  });
});

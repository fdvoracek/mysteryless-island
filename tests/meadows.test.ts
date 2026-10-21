import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/content/registry";
import type { Engine } from "../src/core/engine";
import { view } from "../src/core/selectors";
import { contentProblems, loadRegistry, readContentFiles, startGame } from "./helpers";

const reg = loadRegistry();
const choose = (e: Engine, choice: string) => e.dispatch({ type: "choose", choice });
const explore = (e: Engine, id: string) => { e.dispatch({ type: "explore" }); choose(e, id); choose(e, "close"); };
const labels = (e: Engine) => view(e).actions.map((a) => a.label);
const unknownCells = (e: Engine) => view(e).map.unknown;

/** beach: rocks, cliff, then the climb (the forest stays a "?") */
function toCliffTop(seed: number, choice: "knife" | "water" = "knife") {
  const e = startGame(reg, seed, choice);
  e.applyEffects([{ give: { cordage: 1 } }]); // a rope: the cliff is too steep without one
  for (const id of ["rock_shelter", "cliff_shells", "cliff_top"]) explore(e, id);
  return e;
}

describe("the meadows: seen from the cliff top, west of the beach, an hour away", () => {
  it("are a ? to the west from the start; the climb is offered once the cliff is found, and opens them", () => {
    const e = startGame(reg, 1);
    expect(unknownCells(e)).toEqual([{ col: 2, row: 0 }, { col: 0, row: 0 }]); // forest (right), meadows (left)
    explore(e, "rock_shelter");
    e.dispatch({ type: "explore" });
    expect(view(e).event!.choices.map((c) => c.id)).not.toContain("cliff_top"); // not before the cliff is found
    choose(e, "close");
    explore(e, "cliff_shells");
    expect(view(e).tabs.find((t) => t.here)).toMatchObject({ id: "beach", col: 1 });
    e.dispatch({ type: "explore" });
    expect(view(e).event!.text).toContain("The cliff above them is steep. With a rope, it could be climbed.");
    // too steep without a rope
    expect(view(e).event!.choices.find((c) => c.id === "cliff_top")).toMatchObject({ label: "climb the cliff", time: "30m", hours: 0.5, enabled: false, reason: "Too steep to climb without a rope" });
    expect(choose(e, "cliff_top").ok).toBe(false);
    expect(view(e).quests.find((q) => q.id === "climb_cliff")).toMatchObject({ title: "climb the cliff" });
    e.applyEffects([{ give: { cordage: 1 } }]);
    expect(view(e).event!.choices.find((c) => c.id === "cliff_top")).toMatchObject({ enabled: true });
    choose(e, "cliff_top");
    const found = view(e).event!;
    expect(found.text).toMatch(/Meadows, an hour's walk away\./);
    expect(found.choices).toEqual([
      { id: "go:meadows", travelTo: "meadows", label: "go to the meadows", enabled: true, time: "1h", hours: 1 },
      { id: "close", label: "back", enabled: true },
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
    expect(labels(e)).toEqual(["look around"]); // craft: since the cliff (the rope)
    e.dispatch({ type: "travel", region: "beach" });
    explore(e, "forest_edge");
    e.dispatch({ type: "travel", region: "forest" });
    const t1 = e.state.time;
    e.dispatch({ type: "travel", region: "meadows" });
    expect(e.state.time - t1).toBe(90);
  });

  it("the validator checks hintWhen", () => {
    const files = readContentFiles();
    const m = structuredClone(files["content/regions/meadows.json"]) as { hintWhen: unknown };
    m.hintWhen = { discovered: "atlantis" };
    files["content/regions/meadows.json"] = m;
    expect(contentProblems(() => buildRegistry(files))).toMatch(/region meadows\.hintWhen: unknown discovery "atlantis"/);
  });
});

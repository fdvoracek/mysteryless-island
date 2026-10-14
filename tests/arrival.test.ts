import { describe, expect, it } from "vitest";
import { buildRegistry, ContentError } from "../src/content/registry";
import { Engine } from "../src/core/engine";
import { loadRegistry, readContentFiles } from "./helpers";

const reg = loadRegistry();
const look = (e: Engine) => e.dispatch({ type: "explore" });
const go = (e: Engine, region: string) => e.dispatch({ type: "travel", region });
/** the lines written by the last command, in reading order */
const lastTurn = (e: Engine) => e.state.log.filter((l) => l.turn === e.state.turn).map((l) => l.text).reverse();

describe("arriving in a region", () => {
  it("the first visit shows the full description; coming back shows what you see now", () => {
    const e = Engine.newGame(reg, 1);
    look(e); // finds the forest
    go(e, "forest");
    expect(lastTurn(e)).toEqual([
      "You walk to the forest.", "Tall trunks, close together.", "The sea is only a sound now.",
      "Somewhere ahead, water runs over stones.",
    ]);
    go(e, "beach");
    const beach = lastTurn(e);
    expect(beach[0]).toBe("You walk to the beach.");
    expect(beach[1]).toMatch(/^Back on the sand|^The beach again/);
    expect(beach).toHaveLength(2); // nothing else found on the beach yet
    go(e, "forest");
    const forest = lastTurn(e);
    expect(forest[1]).toMatch(/^The trees close in again|^Back under the trees/);
    expect(forest).toContain("Somewhere ahead, water runs over stones."); // the spring is not found yet
  });

  it("the view follows what you found: dry wood, then the spring", () => {
    const e = Engine.newGame(reg, 2);
    look(e);
    go(e, "forest");
    look(e); // dry wood
    look(e); // the spring
    go(e, "beach");
    go(e, "forest");
    const forest = lastTurn(e);
    expect(forest).toContain("Dry branches everywhere.");
    expect(forest).toContain("The spring trickles between mossy stones.");
    expect(forest).not.toContain("Somewhere ahead, water runs over stones.");
  });

  it("the beach shows the rocks with or without the fire, the shells and the fish", () => {
    const e = Engine.newGame(reg, 3);
    for (let i = 0; i < 4; i++) look(e); // forest, rocks, cliff, fish
    e.applyEffects([{ give: { firewood: 3 } }]);
    e.dispatch({ type: "activity", id: "light_fire" });
    go(e, "forest");
    go(e, "beach");
    const lit = lastTurn(e);
    expect(lit).toContain("Smoke rises from the ring of rocks.");
    expect(lit).toContain("Shells on the stone under the cliff.");
    expect(lit).toContain("Fish flash in the shallows.");
    expect(lit).not.toContain("The ring of rocks waits, cold.");

    e.state.timers.fire = 0; // the fire goes out
    go(e, "forest");
    go(e, "beach");
    expect(lastTurn(e)).toContain("The ring of rocks waits, cold.");
  });

  it("at night you see less", () => {
    const e = Engine.newGame(reg, 4);
    look(e);
    go(e, "forest");
    e.advance(14, "rest"); // into the night
    go(e, "beach");
    expect(lastTurn(e)).toContain("The beach in the dark. Only the surf, and a pale line of foam.");
    go(e, "forest");
    expect(lastTurn(e)).toContain("Under the trees the dark is total. You feel your way between the trunks.");
  });

  it("the validator checks the conditions of arrival lines", () => {
    const files = readContentFiles();
    const forest = structuredClone(files["content/regions/forest.json"]) as { arrive: Array<{ when?: unknown }> };
    forest.arrive[0].when = { discovered: "atlantis" };
    files["content/regions/forest.json"] = forest;
    expect(() => buildRegistry(files)).toThrow(ContentError);
  });
});

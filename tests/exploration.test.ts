import { describe, expect, it } from "vitest";
import { buildRegistry, ContentError } from "../src/content/registry";
import { view } from "../src/core/selectors";
import { loadRegistry, readContentFiles, startGame, lookAround } from "./helpers";

const reg = loadRegistry();
const look = lookAround;

describe("exploration", () => {

  it("each region keeps its own progress; the * shows where something is left", () => {
    const e = startGame(reg, 1);
    look(e); look(e);
    e.dispatch({ type: "travel", region: "forest" });
    expect(view(e).actions[0].badge).toBe("*");
    look(e);
    expect(e.state.regions.beach.explored).toBe(2);
    expect(e.state.regions.forest.explored).toBe(1);
    expect(view(e).actions[0].badge).toBeUndefined(); // the forest has nothing left
    e.dispatch({ type: "travel", region: "beach" });
    expect(view(e).actions[0].badge).toBe("*"); // the cliff and the shallows are still there
  });

  it("each action's lines read top-down, newest action first (classic) or as one paragraph (turns)", () => {
    const e = startGame(reg, 1);
    look(e);
    look(e);
    const v = view(e);
    // the newest first; a finding is its own paragraph, and what it causes comes after it
    expect(v.log[0]).toMatch(/^At the far end of the beach.*natural shelter/);
    expect(v.turns[0].lines).toEqual([v.log[0]]);
    expect(v.turns[1].lines).toEqual(["A way to the forest opens."]);
    expect(v.turns[2].lines[0]).toMatch(/^You climb the dunes\./);
    // before that: the opening line, after the shipwreck pages (the oldest paragraphs)
    expect(v.turns[3].lines[0]).toMatch(/^Awake\. Salt in the mouth\./);
    expect(v.turns.at(-1)!.lines[0]).toMatch(/^You were three days out/);
  });

  it("the validator rejects unknown discoveries in conditions", () => {
    const files = readContentFiles();
    const forest = structuredClone(files["content/regions/forest.json"]) as { unlockWhen: unknown };
    forest.unlockWhen = { discovered: "atlantis" };
    files["content/regions/forest.json"] = forest;
    expect(() => buildRegistry(files)).toThrow(ContentError);
  });
});

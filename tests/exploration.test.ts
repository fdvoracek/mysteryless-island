import { describe, expect, it } from "vitest";
import { buildRegistry, ContentError } from "../src/content/registry";
import { Engine } from "../src/core/engine";
import { view } from "../src/core/selectors";
import { loadRegistry, readContentFiles, startGame, lookAround } from "./helpers";

const reg = loadRegistry();
const labels = (e: Engine) => view(e).actions.map((a) => a.label);
const look = lookAround;
const logHas = (e: Engine, text: string) => e.state.log.some((l) => l.text.includes(text));

describe("exploration", () => {
  it("beach step 1: the beach is described and the forest is found", () => {
    const e = startGame(reg, 1);
    const t0 = e.state.time;
    expect(look(e).ok).toBe(true);
    expect(e.state.time - t0).toBe(30); // takes half an hour
    expect(logHas(e, "A forest, close and hard to miss")).toBe(true);
    expect(view(e).tabs.map((t) => t.id)).toEqual(["beach", "forest"]);
    expect(e.dispatch({ type: "travel", region: "forest" }).ok).toBe(true);
  });

  it("beach step 2: the rocks with cover reveal light fire and sleep", () => {
    const e = startGame(reg, 1);
    look(e); look(e);
    expect(logHas(e, "a ring of rocks breaks the sea wind")).toBe(true);
    expect(labels(e)).toEqual(["look around", "craft", "build"]);
  });

  it("beach step 3: the cliff with shells reveals collect shells", () => {
    const e = startGame(reg, 1);
    look(e); look(e); look(e);
    expect(logHas(e, "Shells cling to the wet stone")).toBe(true);
    expect(labels(e)).toEqual(["look around", "craft", "build", "collect shells", "pick up stones"]); // craft: the rope for the cliff
  });

  it("beach step 4: the fish need a spear; the cliff is still left (*)", () => {
    const e = startGame(reg, 1);
    look(e); look(e); look(e); look(e);
    expect(logHas(e, "With a sharp stick you might spear one")).toBe(true);
    expect(labels(e)).toEqual(["look around", "craft", "build", "collect shells", "pick up stones", "catch fish"]); // the spear can be crafted now: the craft button appears; nothing to build yet
    expect(view(e).actions[0].badge).toBe("*");
    expect(view(e).quests.map((q) => q.id)).toContain("first_catch"); // catching one is a task now
  });

  it("beach step 5: climbing the cliff shows the meadows; 'look around' stays, without the *", () => {
    const e = startGame(reg, 1);
    e.applyEffects([{ give: { cordage: 1 } }]); // a rope: the cliff is too steep without one
    for (let i = 0; i < 5; i++) look(e);
    expect(logHas(e, "Meadows, an hour's walk away.")).toBe(true);
    expect(e.state.regions.meadows.unlocked).toBe(true);
    expect(view(e).actions[0].badge).toBeUndefined();
  });

  it("forest: collect wood from the start; following the sound of water finds the spring", () => {
    const e = startGame(reg, 1);
    look(e);
    e.dispatch({ type: "travel", region: "forest" });
    expect(labels(e)).toEqual(["look around", "build", "collect wood"]);
    look(e);
    expect(labels(e)).toEqual(["look around", "build", "collect wood", "drink water"]);
  });

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

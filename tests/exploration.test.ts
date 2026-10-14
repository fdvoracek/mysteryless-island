import { describe, expect, it } from "vitest";
import { buildRegistry, ContentError } from "../src/content/registry";
import { Engine } from "../src/core/engine";
import { view } from "../src/core/selectors";
import { loadRegistry, readContentFiles } from "./helpers";

const reg = loadRegistry();
const labels = (e: Engine) => view(e).actions.map((a) => a.label);
const look = (e: Engine) => e.dispatch({ type: "explore" });
const logHas = (e: Engine, text: string) => e.state.log.some((l) => l.text.includes(text));

describe("exploration", () => {
  it("beach step 1: the beach is described and the forest is found", () => {
    const e = Engine.newGame(reg, 1);
    const t0 = e.state.time;
    expect(look(e).ok).toBe(true);
    expect(e.state.time - t0).toBe(60); // takes an hour
    expect(logHas(e, "A forest, close and hard to miss")).toBe(true);
    expect(view(e).tabs.map((t) => t.id)).toEqual(["beach", "forest"]);
    expect(e.dispatch({ type: "travel", region: "forest" }).ok).toBe(true);
  });

  it("beach step 2: the rocks with cover reveal light fire and sleep", () => {
    const e = Engine.newGame(reg, 1);
    look(e); look(e);
    expect(logHas(e, "a ring of rocks breaks the sea wind")).toBe(true);
    expect(labels(e)).toEqual(["look around", "light fire", "sleep"]);
  });

  it("beach step 3: the cliff with shells reveals collect shells", () => {
    const e = Engine.newGame(reg, 1);
    look(e); look(e); look(e);
    expect(logHas(e, "Shells cling to the wet stone")).toBe(true);
    expect(labels(e)).toEqual(["look around", "light fire", "collect shells", "sleep"]);
  });

  it("beach step 4: the fish need a spear; then 'look around' is gone", () => {
    const e = Engine.newGame(reg, 1);
    look(e); look(e); look(e); look(e);
    expect(logHas(e, "With a sharp stick you might spear one")).toBe(true);
    expect(labels(e)).toEqual(["light fire", "collect shells", "catch fish", "sleep"]);
    expect(view(e).quests.map((q) => q.id)).toContain("build_fishing_spear"); // the spear is a task now
    expect(look(e).ok).toBe(false); // nothing left to find
  });

  it("forest: dry wood on the first look, the spring on the second", () => {
    const e = Engine.newGame(reg, 1);
    look(e);
    e.dispatch({ type: "travel", region: "forest" });
    expect(labels(e)).toEqual(["look around"]);
    look(e);
    expect(labels(e)).toEqual(["look around", "collect wood"]);
    look(e);
    expect(labels(e)).toEqual(["collect wood", "drink water"]);
  });

  it("each region keeps its own progress", () => {
    const e = Engine.newGame(reg, 1);
    look(e); look(e);
    e.dispatch({ type: "travel", region: "forest" });
    look(e);
    expect(e.state.regions.beach.explored).toBe(2);
    expect(e.state.regions.forest.explored).toBe(1);
    expect(view(e).actions[0].tooltip).toContain("partly explored");
  });

  it("each action's lines read top-down, newest action first (classic) or as one paragraph (turns)", () => {
    const e = Engine.newGame(reg, 1);
    look(e);
    look(e);
    const v = view(e);
    expect(v.log[0]).toMatch(/^At the far end of the beach/);
    expect(v.log[1]).toMatch(/You could light a fire here/);
    expect(v.turns[0].lines).toEqual([v.log[0], v.log[1]]);
    // the first look: description, discovery, then the unlock line, in that order
    expect(v.turns[1].lines[0]).toMatch(/^Grey sand runs both ways/);
    expect(v.turns[1].lines.at(-1)).toBe("A way to the forest opens.");
    // the intro reads top-down too
    expect(v.turns.at(-1)!.lines[0]).toBe("Awake. Salt in the mouth.");
  });

  it("dying rolls exploration back to the checkpoint", () => {
    const e = Engine.newGame(reg, 1);
    e.state.stats.health = 1;
    e.state.stats.thirst = 100;
    look(e);
    expect(e.state.dead).toBe(true);
    e.restoreCheckpoint();
    expect(e.state.regions.beach.explored).toBe(0);
  });

  it("the validator rejects unknown discoveries in conditions", () => {
    const files = readContentFiles();
    const forest = structuredClone(files["content/regions/forest.json"]) as { unlockWhen: unknown };
    forest.unlockWhen = { discovered: "atlantis" };
    files["content/regions/forest.json"] = forest;
    expect(() => buildRegistry(files)).toThrow(ContentError);
  });
});

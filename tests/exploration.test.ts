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
  it("beach step 1: the beach is described and fish appear", () => {
    const e = Engine.newGame(reg, 1);
    const t0 = e.state.time;
    expect(look(e).ok).toBe(true);
    expect(e.state.time - t0).toBe(60); // takes an hour
    expect(logHas(e, "a school of small fish")).toBe(true);
    expect(labels(e)).toEqual(["look around", "catch fish"]);
    expect(view(e).tabs.map((t) => t.id)).toEqual(["beach"]);
  });

  it("beach step 2: the forest is found and its tab appears", () => {
    const e = Engine.newGame(reg, 1);
    look(e); look(e);
    expect(logHas(e, "the dark line is a forest")).toBe(true);
    expect(view(e).tabs.map((t) => t.id)).toEqual(["beach", "forest"]);
    expect(e.dispatch({ type: "travel", region: "forest" }).ok).toBe(true);
  });

  it("beach step 3: the rock shelter reveals light fire and sleep; then 'look around' is gone", () => {
    const e = Engine.newGame(reg, 1);
    look(e); look(e); look(e);
    expect(logHas(e, "a ring of rocks breaks the sea wind")).toBe(true);
    expect(labels(e)).toEqual(["light fire", "catch fish", "sleep"]);
    expect(look(e).ok).toBe(false); // nothing left to find
  });

  it("forest: dry wood on the first look, the spring on the second", () => {
    const e = Engine.newGame(reg, 1);
    look(e); look(e);
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

  it("paragraphs read top-down in the log (newest-first log)", () => {
    const e = Engine.newGame(reg, 1);
    look(e);
    const top = e.state.log.slice(0, 2).map((l) => l.text);
    expect(top[0]).toMatch(/^grey sand runs both ways/);
    expect(top[1]).toMatch(/school of small fish/);
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

import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/content/registry";
import type { Engine } from "../src/core/engine";
import { view } from "../src/core/selectors";
import { loadRegistry, lookAround, readContentFiles, startGame } from "./helpers";

const reg = loadRegistry();

/** let the given damage kill you as time passes (an hour of work) */
function dieOf(e: Engine, setup: (e: Engine) => void) {
  e.state.stats.health = 1;
  setup(e);
  e.advance(1, "work");
  expect(e.state.dead).toBe(true);
  return e.state.death!;
}

describe("death is permanent, with an end screen", () => {
  it("records why you died: the damage rule hurting you", () => {
    expect(dieOf(startGame(reg, 1), (e) => { e.state.stats.thirst = 100; }).cause).toBe("thirst");
    expect(dieOf(startGame(reg, 2), (e) => { e.state.stats.hunger = 100; }).cause).toBe("hunger");
  });

  it("rules that hurt equally are named together", () => {
    expect(dieOf(startGame(reg, 9), (e) => { e.state.stats.hunger = 100; e.state.stats.thirst = 100; }).cause).toBe("hunger and thirst");
  });

  it("when several rules hurt, the worst one is the cause (cold hurts most)", () => {
    const d = dieOf(startGame(reg, 3), (e) => {
      e.state.stats.thirst = 100;
      e.state.warmth = reg.bandIds.indexOf("freezing");
      e.state.time = 2 * 60; // night, so you stay freezing
    });
    expect(d.cause).toBe("cold");
  });

  it("the end screen: how long you lasted, the cause, and the story of your days", () => {
    const e = startGame(reg, 4, "knife");
    e.state.time += 25 * 60; // a day and an hour later (the first night survived)
    e.syncQuests();
    lookAround(e); // the dunes: the forest
    const d = dieOf(e, (x) => { x.state.stats.thirst = 100; });
    expect(d.lines[0]).toBe("You lasted 1 day and 2 hours on the island, until day 2.");
    expect(d.lines[1]).toBe("Cause of death: thirst.");
    expect(d.lines.slice(2)).toEqual([
      "You swam ashore with the knife in your fist.",
      "You found the forest beyond the dunes.",
      "You lived through the first night.",
    ]);
    expect(view(e).end).toEqual({ title: "The journal ends", lines: d.lines, restart: "start again", load: "load the saved game" });
  });

  it("the recap follows what you did: the matches, the fire, the spring, the spear", () => {
    const e = startGame(reg, 5, "matches");
    for (let i = 0; i < 4; i++) lookAround(e); // dunes, rocks, cliff, shallows
    e.applyEffects([{ give: { firewood: 13 } }]);
    e.dispatch({ type: "activity", id: "light_fire" });
    e.dispatch({ type: "questAction", quest: "build_fishing_spear" });
    e.dispatch({ type: "travel", region: "forest" });
    lookAround(e); // the spring
    const recap = dieOf(e, (x) => { x.state.stats.thirst = 100; }).lines.slice(2);
    expect(recap[0]).toBe("You swam ashore with a tin of matches inside your shirt.");
    expect(recap.slice(1, 5)).toEqual([ // at most four things, most memorable first
      "You found the forest beyond the dunes.",
      "You found a spring of clear water.",
      "You made fire in the ring of rocks.",
      "You made a fishing spear.",
    ]);
    expect(recap[5]).toBe("You did not see a second morning.");
  });

  it("a short life: nothing found", () => {
    const d = dieOf(startGame(reg, 6, "rations", { matches: false }), (e) => { e.state.stats.thirst = 100; });
    expect(d.lines).toContain("You swam ashore with three days of rations tied to your wrist.");
    expect(d.lines).toContain("You never left the sand where the sea put you.");
    expect(d.lines[0]).toBe("You lasted 30 minutes on the island, until day 1."); // thirst kills from health 1 in 30 min
  });

  it("an event that kills you is named as the cause", () => {
    const files = readContentFiles();
    files["content/events/test.json"] = [{ id: "e_wave", title: "A rogue wave", trigger: { after: ["explore"], chance: 1 },
      scenes: { start: { text: "A wave.", choices: [{ id: "stand", label: "stand", effects: [{ stat: { health: -200 } }] }] } } }];
    const e = startGame(buildRegistry(files), 7);
    lookAround(e);
    e.dispatch({ type: "choose", choice: "stand" });
    expect(e.state.death!.cause).toBe("a rogue wave");
    expect(e.state.death!.lines[1]).toBe("Cause of death: a rogue wave.");
  });

  it("after death nothing else can be done, and the end is kept in the save", () => {
    const e = startGame(reg, 8);
    dieOf(e, (x) => { x.state.stats.thirst = 100; });
    expect(e.dispatch({ type: "explore" })).toMatchObject({ ok: false, reason: "you are dead" });
    const saved = JSON.parse(JSON.stringify(e.state));
    expect(saved.death.lines).toEqual(e.state.death!.lines);
  });
});

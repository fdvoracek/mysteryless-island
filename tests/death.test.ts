import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/content/registry";
import type { Engine } from "../src/core/engine";
import { view } from "../src/core/selectors";
import { loadRegistry, lookAround, readContentFiles, startGame } from "./helpers";

const reg = loadRegistry();

/** let the given damage kill you as time passes (an hour of work) */
function dieOf(e: Engine, setup: (e: Engine) => void) {
  e.state.stats.health = 1;
  e.state.stats.hunger = 100; // no health regeneration
  e.state.warmth = reg.bandIds.indexOf("freezing");
  setup(e);
  e.advance(1, "work");
  expect(e.state.dead).toBe(true);
  return e.state.death!;
}

describe("death is permanent, with an end screen", () => {
  it("hunger and thirst no longer kill you", () => {
    const e = startGame(reg, 1);
    e.state.stats.health = 1;
    e.state.stats.hunger = e.state.stats.thirst = 100;
    e.advance(1, "work");
    expect(e.state.dead).toBe(false);
    expect(e.state.stats.health).toBe(1);
  });

  it("rules that hurt equally are named together", () => {
    const files = readContentFiles();
    const stats = files["content/stats.json"] as { damage: unknown[] };
    stats.damage.push({ when: { flag: "injured" }, healthPerHour: -3, cause: "injury" });
    const e = startGame(buildRegistry(files), 9);
    expect(dieOf(e, (s) => { s.state.flags.push("injured"); }).cause).toBe("cold and injury");
  });

  it("when several rules hurt, the worst one is the cause (cold hurts most)", () => {
    const d = dieOf(startGame(reg, 3), (e) => {
      e.state.stats.thirst = 100;
      e.state.warmth = reg.bandIds.indexOf("freezing");
      e.state.time = 2 * 60; // night, so you stay freezing
    });
    expect(d.cause).toBe("cold");
  });

  it("the end screen: how long you lasted and why, nothing more", () => {
    const e = startGame(reg, 4, "knife");
    e.state.time += 25 * 60; // a day and an hour later
    lookAround(e); // the dunes: an hour
    const d = dieOf(e, (x) => { x.state.stats.health = 0.5; });
    expect(d.lines).toEqual([
      "You lasted 1 day and 1 hour on the island, until day 2.",
      "Cause of death: cold.",
    ]);
    expect(view(e).end).toEqual({ title: "The journal ends", lines: d.lines, restart: "start again", load: "load the saved game" });
  });

  it("a short life is counted in minutes", () => {
    const d = dieOf(startGame(reg, 6, "rations", { matches: false }), (e) => { e.state.stats.thirst = 100; });
    expect(d.lines[0]).toBe("You lasted 30 minutes on the island, until day 1."); // cold kills from health 1 in 30 min
  });

  it("an event that kills you is named as the cause", () => {
    const files = readContentFiles();
    files["content/events/e_wave.json"] = { id: "e_wave", title: "A rogue wave", trigger: { after: ["explore"], chance: 1 },
      scenes: { start: { text: "A wave.", choices: [{ id: "stand", label: "stand", effects: [{ stat: { health: -200 } }] }] } } };
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

import { describe, expect, it } from "vitest";
import { view } from "../src/core/selectors";
import { build, loadRegistry, lookAround, revealAll, startGame, unlockTechnology } from "./helpers";

const reg = loadRegistry();
const close = (e: ReturnType<typeof startGame>) => e.dispatch({ type: "choose", choice: "close" });
/** In the meadows with the river found (the fish trap task) and 20 willow twigs. */
function atTheRiver(seed: number) {
  const e = unlockTechnology(startGame(reg, seed, "knife", { keepNotes: true }));
  e.state.regions.meadows.unlocked = true;
  e.dispatch({ type: "travel", region: "meadows" });
  for (const id of ["berry_bushes", "river"]) { e.dispatch({ type: "explore" }); e.dispatch({ type: "choose", choice: id }); e.dispatch({ type: "choose", choice: "close" }); }
  e.applyEffects([{ give: { willow_twigs: 20 } }]);
  return e;
}

describe("a note when a task is done", () => {
  it("building the fish trap: the story, then what changed", () => {
    const e = atTheRiver(1);
    build(e, "fish_trap");
    const v = view(e).event!;
    expect(v).toMatchObject({ id: "note", title: "Task done: build a fish trap", choices: [{ id: "close", label: "back", enabled: true }] });
    expect(v.text.split("\n\n")).toEqual(["The woven trap is set in the current. The river must now do its part.", "20 willow twigs used.", "Fish trap built."]);
    // the game waits for it, then goes on
    expect(e.dispatch({ type: "activity", id: "drink_river" })).toMatchObject({ ok: false, reason: "an event is open" });
    close(e);
    expect(view(e).event?.title).toBe("Supplies running low");
    close(e);
    expect(view(e).event).toBeNull();
    expect(e.dispatch({ type: "activity", id: "drink_river" }).ok).toBe(true);
  });

  it("surviving the night: the story only (nothing was gained or used)", () => {
    const e = startGame(reg, 2, "knife", { keepNotes: true });
    lookAround(e); lookAround(e); // dunes, rocks
    e.applyEffects([{ give: { firewood: 3 } }]);
    e.applyEffects([{ build: "campfire" }]);
    e.dispatch({ type: "activity", id: "light_fire" });
    e.state.time = 23 * 60; // late evening: eight hours of sleep reach past 06:00
    e.applyEffects([{ build: "bed" }]);
    e.dispatch({ type: "activity", id: "sleep" });
    const v = view(e).event!;
    expect(v.title).toBe("Task done: survive the first night");
    expect(v.text).toBe("Grey light over the water. You made it through the night.");
  });

  it("names inventory and consumables consistently with the item panels", () => {
    const e = revealAll(startGame(reg, 7, "knife", { keepNotes: true }));
    e.applyEffects([{ give: { axe: 1, fishing_spear: 1 } }]);
    e.state.location = "forest";
    expect(e.dispatch({ type: "activity", id: "chop_wood" }).ok).toBe(true);
    expect(view(e).event?.text).toContain("added to your inventory.");
    close(e);
    e.state.location = "beach";
    for (let attempt = 0; attempt < 5 && !view(e).event; attempt++) {
      e.state.stats.energy = 100;
      expect(e.dispatch({ type: "activity", id: "catch_fish" }).ok).toBe(true);
    }
    expect(view(e).event?.text).toContain("added to your consumables.");
    expect(view(e).consumables.some((i) => i.id === "raw_fish")).toBe(true);
  });

  it("the note does not write to the journal again (its story is already there)", () => {
    const e = atTheRiver(3);
    build(e, "fish_trap");
    const story = "The woven trap is set in the current. The river must now do its part.";
    const logged = e.state.log.filter((l) => l.text === story).length;
    close(e);
    expect(e.state.log.filter((l) => l.text === story).length).toBe(logged);
    expect(logged).toBe(1);
  });
});

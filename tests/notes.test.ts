import { describe, expect, it } from "vitest";
import { view } from "../src/core/selectors";
import { loadRegistry, lookAround, startGame, craft } from "./helpers";

const reg = loadRegistry();
const close = (e: ReturnType<typeof startGame>) => e.dispatch({ type: "choose", choice: "close" });

describe("a note when a task is done", () => {
  it("building the spear: the story, then what changed", () => {
    const e = startGame(reg, 1, "knife", { keepNotes: true });
    for (let i = 0; i < 4; i++) { lookAround(e); if (view(e).event?.id === "note") close(e); } // the fish start the task
    e.applyEffects([{ give: { firewood: 12 } }]);
    e.state.time = 9 * 60; // daylight, so fishing is possible
    craft(e, "craft_spear");
    const v = view(e).event!;
    expect(v).toMatchObject({ id: "note", title: "Task done: build a fishing spear", choices: [{ id: "close", label: "close", enabled: true }] });
    expect(v.text.split("\n\n")).toEqual([
      "The spear is light and true. The fish will not be so quick now.",
      "Fishing spear added to your inventory.",
      "10 firewood used.",
      "You can now catch fish.",
    ]);
    // the game waits for it, then goes on
    expect(e.dispatch({ type: "activity", id: "catch_fish" })).toMatchObject({ ok: false, reason: "an event is open" });
    close(e);
    expect(view(e).event).toBeNull();
    expect(e.dispatch({ type: "activity", id: "catch_fish" }).ok).toBe(true);
  });

  it("surviving the night: the story only (nothing was gained or used)", () => {
    const e = startGame(reg, 2, "knife", { keepNotes: true });
    lookAround(e); lookAround(e); // dunes, rocks
    e.applyEffects([{ give: { firewood: 3 } }]);
    e.dispatch({ type: "activity", id: "light_fire" });
    e.state.time = 23 * 60; // late evening: eight hours of sleep reach past 06:00
    e.dispatch({ type: "activity", id: "sleep" });
    const v = view(e).event!;
    expect(v.title).toBe("Task done: survive the first night");
    expect(v.text).toBe("Grey light over the water. You made it through the night.");
  });

  it("the note does not write to the journal again (its story is already there)", () => {
    const e = startGame(reg, 3, "knife", { keepNotes: true });
    lookAround(e); lookAround(e); lookAround(e); lookAround(e);
    e.applyEffects([{ give: { firewood: 10 } }]);
    craft(e, "craft_spear");
    const logged = e.state.log.filter((l) => l.text === "The spear is light and true. The fish will not be so quick now.").length;
    close(e);
    expect(e.state.log.filter((l) => l.text === "The spear is light and true. The fish will not be so quick now.").length).toBe(logged);
    expect(logged).toBe(1);
  });
});

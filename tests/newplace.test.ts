import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/content/registry";
import type { Engine } from "../src/core/engine";
import { view } from "../src/core/selectors";
import { loadRegistry, readContentFiles, startGame } from "./helpers";

const reg = loadRegistry();
const choose = (e: Engine, choice: string) => e.dispatch({ type: "choose", choice });
const HINT = "A new place is on your map: the forest. You can walk there now, or later from the map.";

describe("a new place on the map: the pop-up that opened it offers to walk there", () => {
  it("the finding says the place is on the map and has 'go to the forest' next to close; no second pop-up", () => {
    const e = startGame(reg, 1, "knife", { keepNotes: true });
    e.dispatch({ type: "explore" });
    choose(e, "forest_edge"); // the dunes: the forest
    const v = view(e).event!;
    expect(v.text).toMatch(/^You climb the dunes\./);
    expect(v.text.endsWith(`\n\n${HINT}`)).toBe(true);
    expect(v.choices).toEqual([
      { id: "go:forest", label: "go to the forest", enabled: true, time: "30m" },
      { id: "close", label: "back", enabled: true },
    ]);
    expect(e.state.log.some((l) => l.text.includes("on your map"))).toBe(false); // the hint is not the story
    choose(e, "close");
    expect(view(e).event).toBeNull(); // merged: no separate note
    expect(e.state.location).toBe("beach");
  });

  it("'go to the forest' closes the finding and walks there (with the walk's time and texts)", () => {
    const e = startGame(reg, 2, "knife", { keepNotes: true });
    e.dispatch({ type: "explore" });
    choose(e, "forest_edge");
    const t0 = e.state.time;
    expect(choose(e, "go:forest")).toMatchObject({ ok: true, cooldownMs: 0 });
    expect(view(e).event).toBeNull();
    expect(e.state.location).toBe("forest");
    expect(e.state.time - t0).toBe(30);
    expect(e.state.regions.forest.visited).toBe(true);
    expect(choose(e, "go:forest").ok).toBe(false); // nothing open any more
  });

  it("a later finding that opens nothing has only close", () => {
    const e = startGame(reg, 3);
    e.dispatch({ type: "explore" });
    choose(e, "forest_edge");
    choose(e, "close");
    e.dispatch({ type: "explore" });
    choose(e, "rock_shelter");
    expect(view(e).event!.choices.map((c) => c.id)).toEqual(["close"]);
    expect(view(e).event!.text).not.toContain("on your map");
  });

  it("a place opened outside look around (an event choice) gets a note with the same button", () => {
    const files = readContentFiles();
    const forest = structuredClone(files["content/regions/forest.json"]) as { unlockWhen: unknown };
    forest.unlockWhen = { discovered: "spring" }; // not by the dunes any more
    files["content/regions/forest.json"] = forest;
    files["content/events/test.json"] = [{
      id: "e_path", title: "A path", trigger: { when: { discovered: "rock_shelter" } },
      scenes: { start: { text: "A path leads inland.", choices: [{ id: "follow", label: "remember it", effects: [{ unlock: "forest" }] }] } },
    }];
    const e = startGame(buildRegistry(files), 4, "knife", { keepNotes: true });
    e.dispatch({ type: "explore" });
    choose(e, "rock_shelter");
    choose(e, "close");
    expect(view(e).event!.id).toBe("e_path");
    choose(e, "follow");
    const v = view(e).event!;
    expect(v).toMatchObject({ id: "note", title: "A new place", text: HINT });
    expect(v.choices.map((c) => c.label)).toEqual(["go to the forest", "back"]);
    choose(e, "go:forest");
    expect(e.state.location).toBe("forest");
  });
});

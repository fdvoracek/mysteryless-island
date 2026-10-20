import { expect, it } from "vitest";
import type { Command } from "../src/core/engine";
import { loadRegistry, startGame } from "./helpers";

it("reaches the first bed and shelter technology using discovered resources and personal crafts", () => {
  const e = startGame(loadRegistry(), 7, "knife", { matches: false });
  const act = (command: Command) => {
    const result = e.dispatch(command);
    expect(result.ok, JSON.stringify(command)).toBe(true);
    // A provision/completion note may interrupt synchronous draining; acknowledge it and
    // finish the same work without granting supplies, discoveries, or technology.
    for (let steps = 0; e.state.actions.length && steps < 200; steps++) {
      if (e.state.events.active?.kind === "note") e.dispatch({ type: "choose", choice: "close" });
      else if (e.state.actions[0].status === "paused") {
        // Exhaustion may send the player to sleep before the first bed is finished.
        expect(e.dispatch({ type: "resume", id: e.state.actions[0].id }).ok).toBe(true);
      }
      else e.stepActions();
    }
    while (e.state.events.active?.kind === "note") e.dispatch({ type: "choose", choice: "close" });
    expect(e.state.dead).toBe(false);
    expect(e.state.actions, JSON.stringify(command)).toEqual([]);
  };
  const explore = (id: string) => {
    act({ type: "explore" });
    act({ type: "choose", choice: id });
    act({ type: "choose", choice: "close" });
  };

  expect(e.state.items.knife).toBe(1);
  expect(e.state.technology.craft.completed).toEqual([]);
  expect(e.start({ type: "craft", recipe: "craft_axe" }).ok).toBe(false);
  explore("forest_edge");
  explore("rock_shelter");
  explore("cliff_shells");
  for (let i = 0; i < 3; i++) act({ type: "activity", id: "collect_stones" });
  for (let i = 0; i < 3; i++) act({ type: "activity", id: "collect_shells" });
  act({ type: "craft", recipe: "craft_rock_knife" });
  expect(e.state.technology.craft.completed).toEqual(["craft_rock_knife"]);
  expect(e.state.technology.craft.unlocked).toEqual(expect.arrayContaining(["craft_axe", "craft_rope"]));

  act({ type: "travel", region: "forest" });
  explore("spring");
  act({ type: "activity", id: "drink_stream" });
  for (let i = 0; i < 2; i++) act({ type: "activity", id: "gather_wood" });
  act({ type: "craft", recipe: "craft_axe" });
  act({ type: "activity", id: "drink_stream" });
  act({ type: "activity", id: "chop_wood" });
  act({ type: "travel", region: "beach" });
  act({ type: "build", building: "campfire" });
  expect(e.state.timers["fire@beach"] ?? 0).toBe(0);
  expect(e.state.technology.build.unlocked).toContain("bed");
  act({ type: "build", building: "bed" });
  expect(e.state.buildings["bed@beach"].count).toBe(1);
  expect(e.state.buildings["shelter@beach"]).toBeUndefined();
  expect(e.state.technology.build.completed).toEqual(["campfire", "bed"]);
  expect(e.state.technology.build.unlocked).toContain("shelter");
});

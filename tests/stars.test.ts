import { describe, expect, it } from "vitest";
import { Engine } from "../src/core/engine";
import { toStars, view } from "../src/core/selectors";
import { loadRegistry } from "./helpers";

const reg = loadRegistry();
const line = (e: Engine, id: string) => view(e).status.lines.find((l) => l.id === id)!;

describe("star ratings", () => {
  it("maps 0..100 to 0..5 stars, rounding up so 0 stars means exactly 0", () => {
    expect([100, 81, 80, 61, 60, 41, 21, 20, 1, 0.1, 0].map((v) => toStars(v, 5)))
      .toEqual([5, 5, 4, 4, 3, 3, 2, 1, 1, 1, 0]);
  });

  it("shows more stars for better states on every row, including hunger and thirst", () => {
    const e = Engine.newGame(reg, 1);
    e.state.stats.hunger = 0; // full
    e.state.stats.thirst = 100; // parched
    expect(line(e, "hunger")).toMatchObject({ label: "fullness", stars: 5, word: "fed", bad: false });
    expect(line(e, "thirst")).toMatchObject({ label: "hydration", stars: 0, word: "parched", bad: true });
  });

  it("starts with the expected stars", () => {
    const v = view(Engine.newGame(reg, 1));
    const stars = Object.fromEntries(v.status.lines.map((l) => [l.id, l.stars]));
    // health 80, energy 75, hunger 35, thirst 45, comfortable; the fire is not shown
    expect(stars).toEqual({ health: 4, energy: 4, hunger: 4, thirst: 3, comfort: 5 });
  });

  it("comfort has three values: freezing, cold, comfortable", () => {
    const e = Engine.newGame(reg, 1);
    expect(reg.bandIds).toEqual(["freezing", "cold", "comfortable"]);
    const at = (band: string) => { e.state.warmth = reg.bandIds.indexOf(band); return line(e, "comfort"); };
    expect(at("comfortable")).toMatchObject({ label: "comfort", stars: 5, word: "comfortable", bad: false });
    expect(at("cold")).toMatchObject({ stars: 3, word: "cold", bad: false });
    expect(at("freezing")).toMatchObject({ stars: 1, word: "freezing", bad: true });
  });

  it("the fire is not listed in the status panel", () => {
    const v = view(Engine.newGame(reg, 1));
    expect(v.status.lines.map((l) => l.id)).not.toContain("fire");
  });

  it("health at 0 stars is death; other stats at 0 stars drain health instead", () => {
    const e = Engine.newGame(reg, 1);
    e.state.stats.hunger = 100;
    e.state.stats.health = 50;
    e.advance(1, "rest");
    expect(e.state.dead).toBe(false);
    expect(e.state.stats.health).toBeLessThan(50);
    expect(line(e, "hunger").stars).toBe(0);

    e.state.stats.health = 0.5;
    e.advance(1, "rest");
    expect(e.state.dead).toBe(true);
    expect(line(e, "health").stars).toBe(0);
  });

  it("reports the trend for the hover text", () => {
    const e = Engine.newGame(reg, 1);
    e.dispatch({ type: "travel", region: "forest" });
    expect(line(e, "thirst").trend).toBe("worse");
    e.dispatch({ type: "activity", id: "drink_stream" });
    expect(line(e, "thirst").trend).toBe("better");
  });
});

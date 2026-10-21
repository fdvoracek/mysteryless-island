import { describe, expect, it } from "vitest";
import { Engine } from "../src/core/engine";
import { clampPct, view } from "../src/core/selectors";
import { loadRegistry, revealAll, startGame } from "./helpers";

const reg = loadRegistry();
const line = (e: Engine, id: string) => view(e).status.lines.find((l) => l.id === id)!;

describe("ink bars", () => {
  it("clamps and rounds the fill to 0..100", () => {
    expect([-5, 0, 33.333, 100, 140].map(clampPct)).toEqual([0, 0, 33.3, 100, 100]);
  });

  it("a fuller bar is always better, including hunger and thirst", () => {
    const e = startGame(reg, 1);
    e.state.stats.hunger = 0; // full
    e.state.stats.thirst = 100; // parched
    expect(line(e, "hunger")).toMatchObject({ label: "fullness", fill: 100, word: "fed", bad: false });
    expect(line(e, "thirst")).toMatchObject({ label: "hydration", fill: 0, word: "parched", bad: true });
  });

  it("turns the bar to the danger colour at or below the data threshold", () => {
    const e = startGame(reg, 1);
    e.state.stats.thirst = 79; // 21% hydration
    expect(line(e, "thirst").bad).toBe(false);
    e.state.stats.thirst = 80; // 20% hydration: damage starts here too
    expect(line(e, "thirst").bad).toBe(true);
  });

  it("comfort has three values: freezing, cold, comfortable", () => {
    const e = startGame(reg, 1);
    expect(reg.bandIds).toEqual(["freezing", "cold", "comfortable"]);
    const at = (band: string) => { e.state.warmth = reg.bandIds.indexOf(band); return line(e, "comfort"); };
    expect(at("comfortable")).toMatchObject({ label: "comfort", fill: 100, word: "comfortable", bad: false });
    expect(at("cold")).toMatchObject({ fill: 60, word: "cold", bad: false });
    expect(at("freezing")).toMatchObject({ fill: 20, word: "freezing", bad: true });
  });

  it("reports the trend for the hover text", () => {
    const e = revealAll(startGame(reg, 1));
    e.dispatch({ type: "travel", region: "forest" });
    expect(line(e, "thirst").trend).toBe("worse");
    e.dispatch({ type: "activity", id: "drink_stream" });
    expect(line(e, "thirst").trend).toBe("better");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionController } from "../src/app/action-controller";
import { Engine } from "../src/core/engine";
import { restoreState } from "../src/persistence/migrate";
import { loadRegistry, startGame } from "./helpers";

afterEach(() => vi.useRealTimers());

describe("browser action controller", () => {
  it("schedules one committed step at a time, saves it, and resumes without offline time", () => {
    vi.useFakeTimers();
    const reg = loadRegistry();
    let e = startGame(reg, 2);
    e.state.location = "forest";
    let saved = JSON.stringify(e.state);
    const controller = new ActionController(() => e, () => { saved = JSON.stringify(e.state); });
    const start = e.state.time;
    controller.send({ type: "activity", id: "gather_wood" });
    vi.advanceTimersByTime(2499);
    expect(e.state.time).toBe(start);
    vi.advanceTimersByTime(1);
    expect(e.state.time).toBe(start + 15);
    controller.stop();
    vi.advanceTimersByTime(86_400_000);
    e = new Engine(reg, restoreState(JSON.parse(saved), reg)!);
    expect(e.state.time).toBe(start + 15);
    controller.sync();
    vi.advanceTimersByTime(2500);
    expect(e.state.time).toBe(start + 30);
    expect(e.state.items.firewood).toBeGreaterThan(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels outstanding ticks when switching to another game", () => {
    vi.useFakeTimers();
    const reg = loadRegistry();
    let e = startGame(reg, 1);
    e.state.location = "forest";
    const controller = new ActionController(() => e, () => {});
    controller.send({ type: "activity", id: "gather_wood" });
    controller.stop();
    e = startGame(reg, 2);
    const state = structuredClone(e.state);
    vi.advanceTimersByTime(10_000);
    expect(e.state).toEqual(state);
  });
});

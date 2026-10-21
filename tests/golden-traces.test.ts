import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Engine, type Command } from "../src/core/engine";
import type { GameState } from "../src/core/state";
import { setVariantMode } from "../src/core/text";
import { readSave, writeSave } from "../src/persistence/save";
import { loadRegistry } from "./helpers";

const SEED = 7;

beforeEach(() => {
  const files = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => files.get(key) ?? null,
    setItem: (key: string, value: string) => { files.set(key, value); },
    removeItem: (key: string) => { files.delete(key); },
  });
  // Exercise both seeded random streams, including remembered narrative variants.
  setVariantMode("random");
});
afterEach(() => { setVariantMode("first"); vi.unstubAllGlobals(); });

/** Sort record keys only. Array order, precise numbers, IDs and all persisted fields survive. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonical(record[key])]));
  }
  return value;
}

function snapshot(engine: Engine) {
  const { log, ...state } = JSON.parse(JSON.stringify(engine.state)) as GameState;
  return canonical({ seed: SEED, state, journal: log.reverse() });
}

function reload(engine: Engine): Engine {
  expect(writeSave(engine.state)).toBe(true);
  const saved = readSave(engine.reg);
  expect(saved).toEqual(engine.state);
  return new Engine(engine.reg, saved!);
}

/** Acknowledge notes and finish interrupted work through the real commands, without grants. */
function send(engine: Engine, command: Command) {
  expect(engine.dispatch(command).ok, JSON.stringify(command)).toBe(true);
  for (let steps = 0; steps < 256; steps++) {
    if (engine.state.events.active?.kind === "note") {
      expect(engine.dispatch({ type: "choose", choice: "close" }).ok).toBe(true);
    } else if (engine.state.actions[0]?.status === "paused") {
      expect(engine.start({ type: "resume", id: engine.state.actions[0].id }).ok).toBe(true);
    } else if (engine.runningActions().length && !engine.state.events.active) engine.stepActions();
    else break;
  }
  expect(engine.state.dead, JSON.stringify(command)).toBe(false);
  expect(engine.state.actions, JSON.stringify(command)).toEqual([]);
}

const explore = (id: string): Command[] => [
  { type: "explore" }, { type: "choose", choice: id }, { type: "choose", choice: "close" },
];
const activity = (id: string, count = 1): Command[] => Array.from({ length: count }, () => ({ type: "activity", id }));

describe("PR-01 golden traces on frozen content", () => {
  it.each(["knife", "water"])("records the shipwreck %s branch and reloads its open scene", (choice) => {
    let engine = Engine.newGame(loadRegistry(), SEED);
    send(engine, { type: "choose", choice });
    expect(engine.state.events.active).toMatchObject({ kind: "event", event: "shipwreck", scene: `swim_${choice}` });
    engine = reload(engine);
    send(engine, { type: "choose", choice: "close" });
    expect(engine.state.events.active).toBeNull();
    expect(engine.state.events.seen.shipwreck.count).toBe(1);
    expect(snapshot(engine)).toMatchSnapshot();
  });

  it("records exploration, outcomes, personal creation, production, quests, sleep and continued play after reload", () => {
    let engine = Engine.newGame(loadRegistry(), SEED);
    const script: Command[] = [
      { type: "choose", choice: "knife" }, { type: "choose", choice: "close" },
      ...explore("forest_edge"), ...explore("rock_shelter"), ...explore("cliff_shells"),
      ...activity("collect_stones", 3), ...activity("collect_shells", 3),
      { type: "craft", recipe: "craft_rock_knife" },
      { type: "travel", region: "forest" }, ...explore("spring"),
      ...activity("drink_stream"), ...activity("gather_wood", 3),
      { type: "craft", recipe: "craft_axe" },
      ...activity("drink_stream"), ...activity("chop_wood", 2),
      { type: "travel", region: "beach" },
      { type: "build", building: "campfire" }, { type: "build", building: "bed" },
      { type: "build", building: "drying_rack" },
      { type: "travel", region: "forest" },
      ...activity("drink_stream"), ...activity("gather_wood", 4),
      { type: "travel", region: "beach" }, ...explore("school_of_fish"),
      { type: "craft", recipe: "craft_spear" },
      ...activity("sleep"), ...activity("catch_fish", 3),
      { type: "building", id: "drying_rack", step: "start" }, ...activity("sleep"),
    ];
    for (const command of script) send(engine, command);
    expect(engine.state.technology.craft.completed).toEqual(["craft_rock_knife", "craft_axe", "craft_spear"]);
    expect(engine.state.technology.build.completed).toEqual(["campfire", "bed", "drying_rack"]);
    expect(engine.state.quests.first_catch.status).toBe("done");
    expect(engine.state.quests.survive_first_night.status).toBe("done");
    expect(engine.state.time % 1440).toBe(360);
    expect(engine.buildingStepFor("drying_rack")?.step).toBe("collect");
    engine = reload(engine);
    send(engine, { type: "building", id: "drying_rack", step: "collect" });
    expect(engine.state.counters["did:take_dried_fish"]).toBe(1);
    expect(engine.state.buildings["drying_rack@beach"].batches).toEqual([]);
    expect(snapshot(engine)).toMatchSnapshot();
  });

  it("rejects an unknown opening choice without granting items or leaving its scene", () => {
    const engine = Engine.newGame(loadRegistry(), SEED);
    const before = structuredClone(engine.state);
    expect(engine.dispatch({ type: "choose", choice: "missing_choice" })).toMatchObject({ ok: false, reason: "unknown choice" });
    expect(engine.state.items).toEqual(before.items);
    expect(engine.state.events).toEqual(before.events);
    expect(engine.state.time).toBe(before.time);
  });
});

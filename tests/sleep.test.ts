import { describe, expect, it } from "vitest";
import { buildRegistry, ContentError } from "../src/content/registry";
import { Engine } from "../src/core/engine";
import type { GameState } from "../src/core/state";
import { loadRegistry, readContentFiles, startGame, lookAround } from "./helpers";

const reg = loadRegistry();
const look = lookAround;
const sleep = (e: Engine) => e.dispatch({ type: "activity", id: "sleep" });
/** the lines written by the last command, in reading order */
const lastTurn = (e: Engine) => e.state.log.filter((l) => l.turn === e.state.turn).map((l) => l.text).reverse();

const INTRO = ["The day comes back to you in pieces.", "Lying still, you go over the day."];
const NOTHING = ["A day of small things. You hardly remember it.", "Nothing much. Sand, wind, waiting."];
const MEMORIES = [
  "The cold sea. Waking alone on the sand.",
  "The spear, straight and sharp, made with your own hands.",
  "Fish flashing in the shallows, just out of reach.",
  "Standing in the surf with the spear raised.",
  "The first spark catching. Smoke, then warmth.",
  "Cold water from a spring between mossy stones.",
  "A ring of rocks, out of the wind.",
  "The cool dark under the trees.",
  "The smell of food over the fire.",
  "Armful after armful of dry branches.",
  "Shells pried from the wet stone.",
  "The taste of fresh water.",
  "Something in your stomach, at least.",
];

/** a game where you can sleep: the rocks found and a fire lit */
function readyToSleep(seed: number, looks = 2): Engine {
  const e = startGame(reg, seed);
  for (let i = 0; i < looks; i++) look(e);
  e.applyEffects([{ give: { firewood: 3 } }]);
  e.dispatch({ type: "activity", id: "light_fire" });
  return e;
}

describe("going to sleep", () => {
  it("says how tired you are, from your energy as you lie down", () => {
    const cases: Array<[number, string]> = [
      [10, "You drop by the fire, too exhausted to feel the cold sand."],
      [30, "You curl up by the fire. Every muscle aches."],
      [60, "You curl up by the fire, tired in a slow, heavy way."],
      [95, "You lie by the fire, not really tired. Sleep is slow to come."],
    ];
    for (const [energy, line] of cases) {
      const e = readyToSleep(1);
      e.state.stats.energy = energy;
      expect(sleep(e).ok).toBe(true);
      const lines = lastTurn(e);
      expect(lines[0], `energy ${energy}`).toBe(line);
      expect(e.state.stats.energy).toBeGreaterThan(energy); // the night restored it; the line was about before
    }
  });

  it("then remembers the day, most memorable first, at most three things", () => {
    const e = readyToSleep(2, 4); // forest, rocks, cliff, fish found; fire lit
    sleep(e);
    const lines = lastTurn(e);
    expect(INTRO).toContain(lines[1]);
    const remembered = lines.filter((l) => MEMORIES.includes(l));
    expect(remembered).toEqual([
      "The cold sea. Waking alone on the sand.",
      "Fish flashing in the shallows, just out of reach.",
      "The first spark catching. Smoke, then warmth.",
    ]);
    // the order of the paragraph: tired, intro, memories, falling asleep, waking
    expect(lines.indexOf(remembered[2])).toBeLessThan(lines.findIndex((l) => l === "Sleep takes you." || l === "At last, sleep."));
  });

  it("remembers only today: the next night starts with an empty day", () => {
    const e = readyToSleep(3, 4);
    sleep(e);
    e.state.timers.fire = 6 * 60; // keep the fire going without lighting it (that would be a memory)
    expect(sleep(e).ok).toBe(true); // nothing done in between
    const lines = lastTurn(e);
    expect(lines.filter((l) => MEMORIES.includes(l))).toEqual([]);
    expect(NOTHING.some((n) => lines.includes(n))).toBe(true);
    expect(lines.some((l) => INTRO.includes(l))).toBe(false); // no "the day comes back" before "nothing much"
  });

  it("counts the forest walk, wood, the spring and a drink as today's memories", () => {
    const e = readyToSleep(4, 2);
    sleep(e); // the first night
    lookAround(e); // the cliff with shells
    lookAround(e); // the fish
    e.dispatch({ type: "travel", region: "forest" });
    look(e); // dry wood
    e.dispatch({ type: "activity", id: "gather_wood" });
    look(e); // the spring
    e.dispatch({ type: "activity", id: "drink_stream" });
    e.dispatch({ type: "travel", region: "beach" });
    e.applyEffects([{ give: { firewood: 3 } }]);
    if (!e.state.timers.fire) e.dispatch({ type: "activity", id: "light_fire" });
    else e.dispatch({ type: "activity", id: "stoke_fire" });
    sleep(e);
    const remembered = lastTurn(e).filter((l) => MEMORIES.includes(l));
    expect(remembered).toHaveLength(3);
    expect(remembered[0]).toBe("Fish flashing in the shallows, just out of reach.");
    expect(remembered).not.toContain("The cold sea. Waking alone on the sand."); // not the first night any more
  });

  it("loads saves made before day memories existed", () => {
    const old = structuredClone(startGame(reg, 5).state) as Partial<GameState>;
    delete old.today;
    const e = new Engine(reg, old as GameState);
    look(e);
    expect(e.state.today.forest_edge).toBe(1);
  });

  it("the validator checks thought conditions", () => {
    const files = readContentFiles();
    const beach = structuredClone(files["content/regions/beach.json"]) as {
      activities: Array<{ id: string; thoughts?: Array<{ lines: Array<{ when?: unknown }> }> }>;
    };
    beach.activities.find((a) => a.id === "sleep")!.thoughts![1].lines[1].when = { today: "atlantis" };
    files["content/regions/beach.json"] = beach;
    expect(() => buildRegistry(files)).toThrow(ContentError);
  });
});

describe("waking up", () => {
  const FALL_ASLEEP = ["Sleep takes you.", "At last, sleep."];
  /** the lines after falling asleep: the morning summary (and any task finished on waking) */
  const morning = (e: Engine) => {
    const lines = lastTurn(e);
    return lines.slice(lines.findIndex((l) => FALL_ASLEEP.includes(l)) + 1);
  };

  it("the night is quiet: no thirst, hunger or fire messages while you sleep", () => {
    const e = readyToSleep(6, 2);
    e.state.stats.thirst = 70; // thirst damage would log "Your lips crack…" every night
    e.state.stats.hunger = 0; // only thirst, so the body line is about thirst
    e.state.timers.fire = 60; // the fire dies during the night
    sleep(e);
    const m = morning(e);
    for (const quiet of ["Your lips crack. The world tilts.", "The fire is dying.", "The fire goes out. Only embers now."]) {
      expect(lastTurn(e)).not.toContain(quiet);
    }
    // instead: when you wake, how your body is, and the fire
    expect(m[0]).toMatch(/^Morning comes|^You wake in the dark/);
    expect(m).toContain("Your mouth is dry, your tongue thick.");
    expect(m.some((l) => l === "The fire is long out. Only cold ash." || l === "The fire died in the night.")).toBe(true);
  });

  it("names the worst thing first, one line about the body", () => {
    const body = (setup: (e: Engine) => void) => {
      const e = readyToSleep(7, 2);
      setup(e);
      sleep(e);
      return morning(e)[1];
    };
    expect(body((e) => { e.state.stats.thirst = 90; e.state.stats.hunger = 90; })).toBe("Hunger and thirst, both at once.");
    expect(body((e) => { e.state.stats.hunger = 85; e.state.stats.thirst = 0; })).toBe("Your stomach is a hollow ache.");
    expect(body((e) => { e.state.stats.hunger = 0; e.state.stats.thirst = 0; })).toMatch(/^You feel rested\.|^You are still tired\./);
  });

  it("says when the fire is still burning", () => {
    const e = readyToSleep(8, 2);
    e.state.timers.fire = 11 * 60; // more than the night
    sleep(e);
    expect(morning(e)).toContain("The fire still smoulders in the ring of rocks.");
  });

  it("dying in your sleep is never quiet", () => {
    const e = readyToSleep(9, 2);
    e.state.stats.health = 2;
    e.state.stats.thirst = 100;
    sleep(e);
    expect(e.state.dead).toBe(true);
    expect(lastTurn(e)).toContain([reg.game.deathLog].flat()[0]);
  });
});


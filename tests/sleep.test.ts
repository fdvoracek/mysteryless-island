import { restoreState } from "../src/persistence/migrate";
import { describe, expect, it } from "vitest";
import { buildRegistry, ContentError } from "../src/content/registry";
import { Engine } from "../src/core/engine";
import type { GameState } from "../src/core/state";
import { loadRegistry, readContentFiles, startGame, lookAround, craft } from "./helpers";

const reg = loadRegistry();
const look = lookAround;
const sleep = (e: Engine) => {
  e.applyEffects([{ build: "bed" }]);
  return e.dispatch({ type: "activity", id: "sleep" });
};
/** the lines written by the last command, in reading order */
const lastTurn = (e: Engine) => e.state.log.filter((l) => l.turn === e.state.log[0]?.turn).map((l) => l.text).reverse();

const INTRO = ["In the quiet before sleep, the day's discoveries return to your mind.", "Lying awake, you consider what your efforts have gained."];
const NOTHING = ["A day of small things. You hardly remember it.", "The island revealed no novelty today, though its familiar demands remained."];
const MEMORIES = [
  "The cold sea. Waking alone on the sand.",
  "The knife shaving the point of a spear comes back to you.",
  "You remember how slowly the stone knife cut into the wood.",
  "You recall the many hours spent grinding a useful edge upon stone.",
  "You picture the fish turning like flashes of silver beneath the water.",
  "You remember standing in the breaking surf with the spear held ready.",
  "The little flame of a match returns to mind, followed by the welcome warmth.",
  "Wood against wood until your palms burned, and at last a flame.",
  "The cold spring among the mossy rocks rises again in memory.",
  "You remember the circle of rocks that shelters your camp from the wind.",
  "The cool shade beneath the forest canopy returns to you.",
  "You remember the welcome scent of food cooking beside the fire.",
  "You recall collecting bundle after bundle of fallen branches.",
  "The stubborn shellfish clinging to the tide-wet stone come back to mind.",
  "You remember how welcome the first fresh water tasted.",
  "You remember your modest meal, enough at least to carry you onward.",
];

/** a game where you can sleep: the rocks found and a fire lit */
function readyToSleep(seed: number, looks = 2): Engine {
  const e = startGame(reg, seed);
  for (let i = 0; i < looks; i++) look(e);
  e.applyEffects([{ give: { firewood: 3 } }]);
  e.applyEffects([{ build: "campfire" }]);
  e.dispatch({ type: "activity", id: "light_fire" });
  return e;
}

describe("going to sleep", () => {
  it("says how tired you are, from your energy as you lie down", () => {
    const cases: Array<[number, string]> = [
      [10, "You lie down so utterly exhausted that thought is beyond your power."],
      [30, "You rest upon the bed, conscious of an ache in every muscle."],
      [60, "You lie down beneath the weight of a long day's labour."],
      [95, "You retire while still wakeful, uncertain whether sleep will soon visit you."],
    ];
    for (const [energy, line] of cases) {
      const e = readyToSleep(1);
      e.state.stats.energy = energy;
      expect(sleep(e).ok).toBe(true);
      const lines = lastTurn(e);
      expect(lines[0], `energy ${energy}`).toBe(line);
      expect(e.state.stats.energy).toBe(100); // the bed sets morning energy
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
      "You picture the fish turning like flashes of silver beneath the water.",
      "The little flame of a match returns to mind, followed by the welcome warmth.", // the fire was lit with a match
    ]);
    // the order of the paragraph: tired, intro, memories, falling asleep, waking
    expect(lines.indexOf(remembered[2])).toBeLessThan(lines.findIndex((l) => l === "At length sleep overcomes you." || l === "The long-expected rest arrives."));
  });

  it("remembers the fire and the spear the way you did them: match or friction, knife or rock knife", () => {
    const memory = (choice: string, matches: boolean) => {
      const e = startGame(reg, 11, choice, { matches });
      for (let i = 0; i < 4; i++) look(e); // the fish start the spear task
      e.applyEffects([{ give: { firewood: 15 } }]); // 10 for the spear, 5 for a fire by friction
      { e.applyEffects([{ give: { stone: 2 } }]); craft(e, "craft_rock_knife"); } // no knife from the ship: a rock knife first
      craft(e, "craft_spear");
      e.applyEffects([{ build: "campfire" }]);
      for (let i = 0; i < 6 && !e.state.timers[`fire@${e.state.location}`]; i++) { // friction can fail: keep trying
        e.state.stats = { health: 100, energy: 50, hunger: 0, thirst: 0 };
        e.dispatch({ type: "activity", id: matches ? "light_fire" : "make_fire" });
      }
      expect(e.state.timers[`fire@${e.state.location}`]).toBeGreaterThan(0);
      sleep(e);
      return lastTurn(e).filter((l) => MEMORIES.includes(l));
    };
    const knifeAndMatches = memory("knife", true);
    expect(knifeAndMatches).toContain("The knife shaving the point of a spear comes back to you.");
    expect(knifeAndMatches).not.toContain("You remember how slowly the stone knife cut into the wood.");
    const stoneAndFriction = memory("rations", false);
    expect(stoneAndFriction).toContain("You remember how slowly the stone knife cut into the wood.");
    expect(stoneAndFriction).not.toContain("The knife shaving the point of a spear comes back to you.");
    // the fire on its own (only the dunes and the rocks explored): match or friction
    const fireMemory = (matches: boolean) => {
      const e = startGame(reg, 12, "rations", { matches });
      look(e); look(e); // the dunes, the ring of rocks
      e.applyEffects([{ give: { firewood: 5 } }]);
      e.applyEffects([{ build: "campfire" }]);
      for (let i = 0; i < 6 && !e.state.timers[`fire@${e.state.location}`]; i++) e.dispatch({ type: "activity", id: matches ? "light_fire" : "make_fire" });
      e.state.stats.energy = 50;
      sleep(e);
      return lastTurn(e).filter((l) => MEMORIES.includes(l));
    };
    expect(fireMemory(true)).toContain("The little flame of a match returns to mind, followed by the welcome warmth.");
    expect(fireMemory(false)).toContain("Wood against wood until your palms burned, and at last a flame.");
    expect(fireMemory(false)).not.toContain("The little flame of a match returns to mind, followed by the welcome warmth.");
  });

  it("remembers only today: the next night starts with an empty day", () => {
    const e = readyToSleep(3, 4);
    sleep(e);
    e.state.timers[`fire@${e.state.location}`] = 6 * 60; // keep the fire going without lighting it (that would be a memory)
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
    if (!e.state.timers[`fire@${e.state.location}`]) e.dispatch({ type: "activity", id: "light_fire" });
    else e.dispatch({ type: "activity", id: "stoke_fire" });
    sleep(e);
    const remembered = lastTurn(e).filter((l) => MEMORIES.includes(l));
    expect(remembered).toHaveLength(3);
    expect(remembered[0]).toBe("You picture the fish turning like flashes of silver beneath the water.");
    expect(remembered).not.toContain("The cold sea. Waking alone on the sand."); // not the first night any more
  });

  it("loads saves made before day memories existed", () => {
    const old = structuredClone(startGame(reg, 5).state) as Partial<GameState>;
    delete old.today;
    const e = new Engine(reg, restoreState(old, reg)!);
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
  const FALL_ASLEEP = ["At length sleep overcomes you.", "The long-expected rest arrives."];
  /** the lines after falling asleep: the morning summary (and any task finished on waking) */
  const morning = (e: Engine) => {
    const lines = lastTurn(e);
    return lines.slice(lines.findIndex((l) => FALL_ASLEEP.includes(l)) + 1);
  };

  it("the night is quiet: no thirst, hunger or fire messages while you sleep", () => {
    const e = readyToSleep(6, 2);
    e.state.stats.thirst = 70; // thirst damage would log "Your lips crack…" every night
    e.state.stats.hunger = 0; // only thirst, so the body line is about thirst
    e.state.timers[`fire@${e.state.location}`] = 60; // the fire dies during the night
    sleep(e);
    const m = morning(e);
    for (const quiet of ["Your lips crack. The world tilts.", "The fire has diminished to an uncertain flame.", "The fire expires, leaving a bed of glowing embers."]) {
      expect(lastTurn(e)).not.toContain(quiet);
    }
    // instead: when you wake, how your body is, and the fire
    expect(m[0]).toBe("Day 2 dawns over the island.");
    expect(m).toContain("Your tongue is dry, and swallowing has become difficult.");
    expect(m.some((l) => l === "The hearth has been extinguished; nothing remains but cold ash." || l === "The fire exhausted its fuel during the night.")).toBe(true);
  });

  it("names the worst thing first, one line about the body", () => {
    const body = (setup: (e: Engine) => void) => {
      const e = readyToSleep(7, 2);
      e.state.time = 22 * 60;
      setup(e);
      sleep(e);
      return morning(e)[2];
    };
    expect(body((e) => { e.state.stats.thirst = 90; e.state.stats.hunger = 90; })).toBe("Hunger and thirst make themselves felt together, with unpleasant urgency.");
    expect(body((e) => { e.state.stats.hunger = 85; e.state.stats.thirst = 0; })).toBe("A persistent ache in the stomach reminds you how little you have eaten.");
    expect(body((e) => { e.state.stats.hunger = 0; e.state.stats.thirst = 0; })).toMatch(/^You awake refreshed/);
  });

  it("says when the fire is still burning", () => {
    const e = readyToSleep(8, 2);
    e.state.time = 22 * 60;
    e.state.timers[`fire@${e.state.location}`] = 11 * 60; // more than the night
    sleep(e);
    expect(morning(e)).toContain("The fire continues to smoulder within the circle of stones.");
  });

  it("dying in your sleep is never quiet", () => {
    const e = readyToSleep(9, 2);
    e.state.stats.health = 2;
    e.state.time = 22 * 60;
    e.state.warmth = reg.bandIds.indexOf("freezing");
    e.state.stats.hunger = 100;
    e.state.timers[`fire@${e.state.location}`] = 0;
    sleep(e);
    expect(e.state.dead).toBe(true);
    expect(lastTurn(e)).toContain([reg.game.deathLog].flat()[0]);
  });
});


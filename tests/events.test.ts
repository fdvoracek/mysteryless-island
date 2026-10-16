import { describe, expect, it } from "vitest";
import { buildRegistry, ContentError, type Registry } from "../src/content/registry";
import { Engine } from "../src/core/engine";
import { view } from "../src/core/selectors";
import type { GameState } from "../src/core/state";
import { loadRegistry, readContentFiles, startGame } from "./helpers";

const reg = loadRegistry();
const choose = (e: Engine, choice: string) => e.dispatch({ type: "choose", choice });
const look = (e: Engine) => e.dispatch({ type: "explore" });

/** The shipped content plus test-only events (content/events/test.json). */
function withEvents(events: unknown[]): Registry {
  const files = readContentFiles();
  files["content/events/test.json"] = events;
  return buildRegistry(files);
}
const scene = (text = "Something happens.") => ({ start: { text } });

describe("the opening event: the shipwreck", () => {
  it("opens before the first journal line; nothing else can be done until it ends", () => {
    const e = Engine.newGame(reg, 1);
    const v = view(e);
    expect(v.event).toMatchObject({ id: "shipwreck", title: "The storm" });
    expect(v.event!.text).toMatch(/^You were three days out when the storm came/);
    expect(v.event!.choices.map((c) => c.label)).toEqual(["the knife", "the matches", "the water can", "the rations"]);
    // the journal already tells the story, one paragraph per paragraph of the page; the beach comes later
    expect(view(e).turns.map((t) => t.lines.join(" ")).reverse()).toEqual([
      expect.stringMatching(/^You were three days out/), expect.stringMatching(/^Then, in the dark/), expect.stringMatching(/^There is a moment/),
    ]);
    expect(look(e)).toMatchObject({ ok: false, reason: "an event is open" });
  });

  it("each choice gives its item, then tells how you reached the shore, with a close button", () => {
    const kits: Array<[string, Record<string, number>, RegExp]> = [
      ["knife", { knife: 1 }, /the knife clenched in your fist/],
      ["matches", { matches: 10 }, /the tin of matches/],
      ["water", { water_can: 1, can_water: 4 }, /the full water can/],
      ["rations", { rations: 6 }, /the bag of rations/],
    ];
    for (const [choice, items, swim] of kits) {
      const e = Engine.newGame(reg, 1);
      expect(choose(e, choice).ok).toBe(true);
      const v = view(e);
      expect(v.event!.text, choice).toMatch(swim);
      expect(v.event!.choices).toEqual([{ id: "close", label: "close", enabled: true }]);
      expect(e.state.items).toEqual({ summer_clothes: 1, ...items });
      expect(choose(e, "close").ok).toBe(true);
      expect(view(e).event).toBeNull();
      expect(e.state.log[0].text).toMatch(/^Awake\. Salt in the mouth\./); // now the journal starts
    }
  });

  it("dying later starts again on the beach, not on the sinking ship", () => {
    const e = startGame(reg, 2, "rations", { matches: false });
    e.state.stats.health = 1;
    e.state.stats.thirst = 100;
    look(e);
    expect(e.state.dead).toBe(true);
    e.restoreCheckpoint();
    expect(e.state.events.active).toBeNull();
    expect(e.state.items.rations).toBe(6);
  });
});

describe("what you grabbed", () => {
  const atTheRocks = (choice: string) => {
    const e = startGame(reg, 3, choice, { matches: false });
    look(e); look(e); // the forest, the ring of rocks
    e.applyEffects([{ give: { firewood: 3 } }]);
    return e;
  };
  const ids = (e: Engine) => view(e).actions.map((a) => a.id);

  it("matches: light fire takes 30 minutes, always works and uses one match", () => {
    const e = atTheRocks("matches");
    expect(ids(e)).toContain("light_fire");
    expect(ids(e)).not.toContain("make_fire");
    const t0 = e.state.time;
    e.dispatch({ type: "activity", id: "light_fire" });
    expect(e.state.time - t0).toBe(30);
    expect(e.state.timers.fire).toBeGreaterThan(0);
    expect(e.state.items.matches).toBe(9);
  });

  it("without matches: 2 hours of friction; it can fail, and the wood is used only when it catches", () => {
    const results = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const e = atTheRocks("knife");
      e.state.rng = Engine.newGame(reg, seed).state.rng; // vary the roll
      expect(ids(e)).toContain("make_fire");
      expect(view(e).actions.find((a) => a.id === "make_fire")!.label).toBe("light fire");
      const t0 = e.state.time;
      e.dispatch({ type: "activity", id: "make_fire" });
      expect(e.state.time - t0).toBe(120);
      if (e.state.timers.fire > 0) { results.add("lit"); expect(e.state.items.firewood ?? 0).toBe(0); }
      else { results.add("failed"); expect(e.state.items.firewood).toBe(3); }
    }
    expect(results).toEqual(new Set(["lit", "failed"]));
  });

  it("the spear: 1 hour with the knife, 3 hours with a sharp stone", () => {
    for (const [choice, minutes] of [["knife", 60], ["water", 180]] as const) {
      const e = startGame(reg, 4, choice);
      for (let i = 0; i < 4; i++) look(e); // the fish start the spear task
      e.applyEffects([{ give: { firewood: 10 } }]);
      const t0 = e.state.time;
      expect(e.dispatch({ type: "questAction", quest: "build_fishing_spear" }).ok).toBe(true);
      expect(e.state.time - t0, choice).toBe(minutes);
      expect(e.state.items.fishing_spear).toBe(1);
    }
  });

  it("the water can: four drinks, then the empty can stays", () => {
    const e = startGame(reg, 5, "water", { matches: false });
    for (let i = 0; i < 4; i++) {
      e.state.stats.thirst = 80;
      expect(e.dispatch({ type: "consume", item: "can_water" }).ok).toBe(true);
      expect(e.state.stats.thirst).toBeLessThan(80);
    }
    expect(e.state.items.can_water ?? 0).toBe(0);
    expect(e.dispatch({ type: "consume", item: "can_water" }).ok).toBe(false);
    expect(view(e).inventory.map((i) => i.id)).toContain("water_can");
  });

  it("the rations: six meals, eaten from the stores", () => {
    const e = startGame(reg, 6, "rations", { matches: false });
    expect(view(e).stores.find((s) => s.id === "rations")).toMatchObject({ count: 6, use: { verb: "eat" } });
    e.state.stats.hunger = 70;
    e.dispatch({ type: "consume", item: "rations" });
    expect(e.state.stats.hunger).toBeLessThan(70);
    expect(e.state.items.rations).toBe(5);
  });
});

describe("event triggers", () => {
  it("at a time: opens after the first action once the clock reaches it, and only once", () => {
    const r = withEvents([{ id: "e_noon", title: "Noon", trigger: { at: { day: 1, hour: 9 } }, scenes: scene() }]);
    const e = startGame(r, 1);
    look(e); // 06:00 -> 07:00
    expect(view(e).event).toBeNull();
    e.advance(2, "rest");
    look(e); // past 09:00
    expect(view(e).event?.id).toBe("e_noon");
    choose(e, "close");
    look(e);
    expect(view(e).event).toBeNull();
  });

  it("by chance after an action: only after the listed actions", () => {
    const r = withEvents([{ id: "e_gull", title: "A gull", trigger: { after: ["explore"], chance: 1 }, scenes: scene() }]);
    const e = startGame(r, 2);
    e.dispatch({ type: "activity", id: "collect_shells" }); // not listed (and not yet visible)
    expect(view(e).event).toBeNull();
    look(e);
    expect(view(e).event?.id).toBe("e_gull");
  });

  it("by chance: a 25% event opens on roughly a quarter of the actions", () => {
    const r = withEvents([{ id: "e_wind", title: "Wind", trigger: { after: ["travel"], chance: 0.25 }, repeat: { cooldownHours: 0 }, scenes: scene() }]);
    const e = startGame(r, 3);
    look(e); // finds the forest
    let opened = 0;
    for (let i = 0; i < 200; i++) {
      e.state.stats = { health: 100, energy: 100, hunger: 0, thirst: 0 };
      e.dispatch({ type: "travel", region: e.state.location === "beach" ? "forest" : "beach" });
      if (view(e).event) { opened++; choose(e, "close"); }
    }
    expect(opened).toBeGreaterThan(30);
    expect(opened).toBeLessThan(75);
  });

  it("repeat: comes back only after its cooldown", () => {
    const r = withEvents([{ id: "e_rain", title: "Rain", trigger: { after: ["explore"], chance: 1 }, repeat: { cooldownHours: 5 }, scenes: scene() }]);
    const e = startGame(r, 4);
    look(e); expect(view(e).event?.id).toBe("e_rain"); choose(e, "close");
    look(e); expect(view(e).event).toBeNull(); // 1 hour later
    e.advance(5, "rest");
    look(e); expect(view(e).event?.id).toBe("e_rain");
  });

  it("when: opens as soon as a condition holds, if its extra condition allows", () => {
    const r = withEvents([{ id: "e_tired", title: "Tired", trigger: { when: { stat: "energy", lte: 50 } }, when: { at: "beach" }, scenes: scene() }]);
    const e = startGame(r, 5);
    e.state.stats.energy = 40;
    look(e);
    expect(view(e).event?.id).toBe("e_tired");
  });
});

describe("events in the journal", () => {
  it("the shipwreck reads as the start of the journal: the storm, the swim, then the beach", () => {
    const e = startGame(reg, 1, "knife");
    const paragraphs = view(e).turns.map((t) => t.lines.join(" ")).reverse();
    expect(paragraphs).toHaveLength(6);
    expect(paragraphs[0]).toMatch(/^You were three days out/);
    expect(paragraphs[2]).toMatch(/^There is a moment/);
    expect(paragraphs[3]).toMatch(/^You jump with the knife clenched in your fist/);
    expect(paragraphs[4]).toMatch(/^You swim until your arms stop answering/);
    expect(paragraphs[5]).toMatch(/^Awake\. Salt in the mouth\./);
  });

  it("an event after an action: the action, then the event page, then what the choice did", () => {
    const r = withEvents([{ id: "e_bottle", title: "A bottle", trigger: { after: ["explore"], chance: 1 },
      scenes: { start: { text: "A bottle in the wrack.", choices: [{ id: "take", label: "take it", effects: [{ give: { firewood: 1 } }, { log: "You keep the cork." }] }] } } }]);
    const e = startGame(r, 2);
    look(e);
    choose(e, "take");
    const paragraphs = view(e).turns.slice(0, 3).map((t) => t.lines.join(" ")).reverse();
    expect(paragraphs[0]).toMatch(/A forest, close and hard to miss/); // the look around
    expect(paragraphs[1]).toBe("A bottle in the wrack.");
    expect(paragraphs[2]).toBe("You keep the cork.");
  });

  it("choosing shows the next page at once (no progress bar)", () => {
    const e = Engine.newGame(reg, 3);
    expect(choose(e, "knife").cooldownMs).toBe(0);
    expect(choose(e, "close").cooldownMs).toBe(0);
  });
});

describe("event choices and effects", () => {
  const story = {
    id: "e_crate", title: "A crate", trigger: { after: ["explore"], chance: 1 },
    scenes: {
      start: {
        text: "A crate in the surf.",
        choices: [
          { id: "open", label: "open it", effects: [{ give: { firewood: 4 } }, { stat: { energy: -10 } }], next: "opened" },
          { id: "map", label: "read the map", requires: { item: "knife" }, requiresText: "The tar seal needs a blade", effects: [{ unlock: "forest" }] },
          { id: "secret", label: "hidden", visibleWhen: { flag: "never" } },
          { id: "leave", label: "leave it" },
        ],
      },
      opened: { text: "Dry wood inside.", close: "take it" },
    },
  };

  it("a choice applies its effects and goes to the next scene; the close label can be set", () => {
    const e = startGame(withEvents([story]), 6);
    look(e);
    const energy = e.state.stats.energy;
    expect(view(e).event!.choices.map((c) => c.id)).toEqual(["open", "map", "leave"]); // hidden one not shown
    choose(e, "open");
    expect(e.state.items.firewood).toBe(4);
    expect(e.state.stats.energy).toBe(energy - 10);
    expect(view(e).event).toMatchObject({ text: "Dry wood inside.", choices: [{ id: "close", label: "take it" }] });
  });

  it("a choice can need something (shown disabled with the reason) and can open a place", () => {
    const noKnife = startGame(withEvents([story]), 7, "rations");
    look(noKnife);
    expect(view(noKnife).event!.choices.find((c) => c.id === "map")).toMatchObject({ enabled: false, reason: "The tar seal needs a blade" });
    expect(choose(noKnife, "map").ok).toBe(false);

    // a forest that only the event can open (its usual unlock never comes true here)
    const files = readContentFiles();
    files["content/events/test.json"] = [story];
    const forest = structuredClone(files["content/regions/forest.json"]) as { unlockWhen: unknown };
    forest.unlockWhen = { flag: "never" };
    files["content/regions/forest.json"] = forest;
    const e = startGame(buildRegistry(files), 7, "knife");
    look(e);
    expect(e.state.regions.forest.unlocked).toBe(false);
    choose(e, "map");
    expect(e.state.regions.forest.unlocked).toBe(true);
    expect(view(e).event).toBeNull();
    expect(e.state.log[0].text).toBe("A way to the forest opens.");
    expect(e.state.log[1].text).toBe("A crate in the surf."); // the event page first, then what it caused
  });

  it("an event that kills you ends with death", () => {
    const r = withEvents([{ id: "e_wave", title: "A wave", trigger: { after: ["explore"], chance: 1 },
      scenes: { start: { text: "A wave.", choices: [{ id: "stand", label: "stand", effects: [{ stat: { health: -200 } }] }] } } }]);
    const e = startGame(r, 8);
    look(e);
    choose(e, "stand");
    expect(e.state.dead).toBe(true);
    expect(view(e).event).toBeNull();
  });

  it("loads saves made before events existed", () => {
    const old = structuredClone(startGame(reg, 9).state) as Partial<GameState>;
    delete old.events;
    const e = new Engine(reg, old as GameState);
    expect(look(e).ok).toBe(true);
  });
});

describe("the validator checks events", () => {
  const bad = (event: unknown, match: RegExp) => {
    expect(() => withEvents([event])).toThrow(ContentError);
    try { withEvents([event]); } catch (err) { expect((err as ContentError).problems.join("\n")).toMatch(match); }
  };
  it("rejects missing scenes, unknown next scenes, unknown actions and bad effects", () => {
    bad({ id: "x1", title: "x", trigger: "start", scenes: { other: { text: "A." } } }, /needs a scene called "start"/);
    bad({ id: "x2", title: "x", trigger: "start", scenes: { start: { text: "A.", choices: [{ id: "go", label: "go", next: "nowhere" }] } } }, /unknown scene "nowhere"/);
    bad({ id: "x3", title: "x", trigger: { after: ["dance"], chance: 0.5 }, scenes: scene() }, /unknown action "dance"/);
    bad({ id: "x4", title: "x", trigger: "start", scenes: { start: { text: "A.", choices: [{ id: "go", label: "go", effects: [{ unlock: "atlantis" }] }] } } }, /unknown region "atlantis"/);
    bad({ id: "x5", title: "x", trigger: { after: ["explore"], chance: 1.5 }, scenes: scene() }, /trigger/);
  });
});

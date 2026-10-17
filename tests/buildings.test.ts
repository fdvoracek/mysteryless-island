import { describe, expect, it } from "vitest";
import { buildRegistry, ContentError } from "../src/content/registry";
import { Engine } from "../src/core/engine";
import { view } from "../src/core/selectors";
import type { GameState } from "../src/core/state";
import { loadRegistry, lookAround, readContentFiles, revealAll, startGame, craft, build } from "./helpers";

const reg = loadRegistry();
type Step = "start" | "collect";
const act = (e: Engine, id: string, step: Step) => e.dispatch({ type: "building", id, step });
const row = (e: Engine, id: string) => view(e).buildings.find((b) => b.id === id);
/** The build menu here: what it offers (opened and closed again; no time passes). */
function buildMenu(e: Engine) {
  if (!e.dispatch({ type: "menu", menu: "build" }).ok) return [];
  const choices = view(e).event!.choices.filter((c) => c.id !== "close");
  e.dispatch({ type: "choose", choice: "close" });
  return choices;
}
/** Let game hours pass, staying fed and watered (a long wait would kill you otherwise). */
function wait(e: Engine, hours: number) {
  for (let left = hours; left > 0; left -= Math.min(left, 6)) {
    e.state.stats = { ...e.state.stats, health: 100, hunger: 0, thirst: 0 };
    e.advance(Math.min(left, 6), "rest");
  }
}
const plenty = { timber: 20, stone: 20, firewood: 20, willow_twigs: 80, cordage: 5, corn: 10, raw_fish: 6, berries: 6, axe: 1, hoe: 1 };

/** Everything found and every task started, standing in `region` with plenty of materials. */
function ready(region: string, seed = 1) {
  const e = revealAll(startGame(reg, seed));
  e.applyEffects([{ give: plenty }]);
  for (const q of reg.quests.keys()) if (!e.state.quests[q]) e.startQuest(q);
  e.state.location = region;
  e.state.stats = { health: 100, energy: 100, hunger: 0, thirst: 0 };
  return e;
}

describe("buildings: put up through a task, listed in the place's panel", () => {
  it("the shelter: needs logs, and logs need an axe made of firewood and stones", () => {
    const e = startGame(reg, 1);
    for (let i = 0; i < 3; i++) lookAround(e); // dunes, rocks, cliff
    expect(view(e).quests.map((q) => q.id)).not.toContain("build_shelter");
    e.state.quests.survive_first_night.status = "done"; // as if the night had passed
    e.syncQuests();
    const ids = view(e).quests.map((q) => q.id);
    expect(ids).toContain("build_shelter");
    expect(ids).toContain("cut_logs"); // the shelter needs logs, logs need an axe
    expect(view(e).quests.find((q) => q.id === "cut_logs")!.needs).toEqual([[{ label: "axe", have: false }]]);
    const task = view(e).quests.find((q) => q.id === "build_shelter")!;
    expect(task.progress).toEqual([{ label: "logs", have: 0, need: 4 }]);
    // the task has no button: the shelter is in the build menu, with what it needs
    expect(buildMenu(e)).toEqual([{ id: "shelter", label: "shelter", enabled: false, reason: "Needs 4 logs (have 0)", time: "2h", tooltip: "4 logs · 2h. A lean-to of logs against the rocks. Warmer, and you can sleep without a fire." }]);
    // stones under the cliff, firewood from the forest, then the axe
    expect(view(e).actions.map((a) => a.id)).toContain("collect_stones");
    e.applyEffects([{ give: { stone: 2, firewood: 2 } }]);
    craft(e, "craft_axe");
    expect(e.state.items.axe).toBe(1);
    e.dispatch({ type: "travel", region: "forest" });
    expect(view(e).actions.map((a) => a.label)).toContain("chop wood");
    e.dispatch({ type: "activity", id: "chop_wood" });
    e.dispatch({ type: "activity", id: "chop_wood" });
    expect(e.state.items.timber).toBeGreaterThanOrEqual(4);
    // it is built where it belongs: not in the forest
    expect(buildMenu(e).map((c) => c.id)).not.toContain("shelter");
    e.dispatch({ type: "travel", region: "beach" });
    const cold = e.feltTemperature();
    expect(build(e, "shelter").ok).toBe(true);
    expect(buildMenu(e).map((c) => c.id)).not.toContain("shelter"); // one is enough: it leaves the menu
    expect(e.feltTemperature()).toBe(cold + 3);
    expect(row(e, "shelter")).toMatchObject({ label: "shelter", count: 1, word: "standing" });
    expect(e.state.quests.build_shelter.status).toBe("done");
    // the task's note says what changed
    expect(e.state.log.some((l) => /wind breaks on the logs|rough but yours/.test(l.text))).toBe(true);
  });

  it("the shelter lets you sleep without a fire; the bed makes sleep better", () => {
    const sleepFrom = (built: string[]) => {
      const e = ready("beach");
      for (const b of built) e.applyEffects([{ build: b }]);
      e.state.timers.fire = 0;
      e.state.time = 22 * 60;
      e.state.stats.energy = 0;
      const res = e.dispatch({ type: "activity", id: "sleep" });
      return { ok: res.ok, energy: e.state.stats.energy };
    };
    expect(sleepFrom([]).ok).toBe(false); // no fire, no shelter
    const shelter = sleepFrom(["shelter"]);
    expect(shelter.ok).toBe(true);
    const bed = sleepFrom(["shelter", "bed"]);
    expect(bed.energy).toBeGreaterThan(shelter.energy);
  });

  it("the fish trap: 20 willow twigs from the river, 1 fish every 2 hours up to 3, stays set", () => {
    const e = startGame(reg, 2);
    e.state.regions.meadows.unlocked = true;
    e.dispatch({ type: "travel", region: "meadows" });
    for (const id of ["berry_bushes", "river"]) { e.dispatch({ type: "explore" }); e.dispatch({ type: "choose", choice: id }); e.dispatch({ type: "choose", choice: "close" }); }
    expect(view(e).quests.map((q) => q.id)).toContain("build_fish_trap");
    const t0 = e.state.time;
    e.dispatch({ type: "activity", id: "cut_willow" });
    expect(e.state.time - t0).toBe(30);
    expect(e.state.items.willow_twigs).toBe(10);
    e.dispatch({ type: "activity", id: "cut_willow" });
    expect(row(e, "fish_trap")).toBeUndefined(); // not built yet: it is in the build menu
    expect(view(e).quests.find((q) => q.id === "build_fish_trap")).toMatchObject({ progress: [{ label: "willow twigs", have: 20, need: 20 }] });
    expect(buildMenu(e).find((c) => c.id === "fish_trap")).toMatchObject({ label: "fish trap", enabled: true, tooltip: expect.stringMatching(/^20 willow twigs · 1h/) });
    expect(build(e, "fish_trap").ok).toBe(true);
    expect(e.state.items.willow_twigs ?? 0).toBe(0);
    expect(row(e, "fish_trap")).toMatchObject({ word: "not set", action: { label: "set" } });
    act(e, "fish_trap", "start");
    expect(row(e, "fish_trap")!.word).toBe("set · 2h");
    expect(row(e, "fish_trap")!.action).toBeUndefined();
    e.advance(2, "rest");
    expect(row(e, "fish_trap")).toMatchObject({ word: "1 fish", action: { label: "empty" } });
    wait(e, 10); // a long wait: the trap holds 3 at most
    expect(row(e, "fish_trap")!.word).toBe("3 fish");
    const fish = e.state.items.raw_fish ?? 0;
    act(e, "fish_trap", "collect");
    expect(e.state.items.raw_fish).toBe(fish + 3);
    expect(row(e, "fish_trap")!.word).toBe("set · 2h"); // still set
  });

  it("fish traps can stand wherever you can fish, up to 3 in a place; they work together", () => {
    const e = ready("meadows");
    build(e, "fish_trap");
    expect(buildMenu(e).find((c) => c.id === "fish_trap")).toMatchObject({ label: "fish trap (2 of 3)" });
    build(e, "fish_trap");
    build(e, "fish_trap");
    expect(row(e, "fish_trap")).toMatchObject({ label: "fish trap ×3", count: 3 });
    expect(buildMenu(e).map((c) => c.id)).not.toContain("fish_trap"); // 3 is the most: it leaves the menu
    // setting and emptying all three takes three times as long; each batch is a fish per trap
    const t0 = e.state.time;
    act(e, "fish_trap", "start");
    expect(e.state.time - t0).toBe(45);
    wait(e, 4);
    const fish = e.state.items.raw_fish ?? 0;
    act(e, "fish_trap", "collect");
    expect(e.state.items.raw_fish).toBe(fish + 6); // 2 batches x 3 traps
    e.state.location = "beach";
    expect(buildMenu(e).find((c) => c.id === "fish_trap")).toMatchObject({ label: "fish trap" }); // another place, its own
    build(e, "fish_trap");
    expect(Object.keys(e.state.buildings).filter((k) => k.startsWith("fish_trap@")).sort()).toEqual(["fish_trap@beach", "fish_trap@meadows"]);
    e.state.location = "forest";
    expect(buildMenu(e).map((c) => c.id)).not.toContain("fish_trap"); // no fish here
  });

  it("the corn field: dug with a hoe and sown with wild corn; ripe in 3 days; harvest, then sow again", () => {
    const e = ready("meadows");
    e.state.items.hoe = 0;
    expect(buildMenu(e).find((c) => c.id === "corn_field")).toMatchObject({ enabled: false, reason: "Needs a hoe to break the ground" });
    e.state.items.hoe = 1;
    e.state.items.corn = 2;
    build(e, "corn_field");
    expect(e.state.items.corn).toBe(0);
    expect(row(e, "corn_field")!.word).toBe("growing · 3d"); // sown as it was dug
    wait(e, 71.75);
    expect(row(e, "corn_field")!.word).toBe("growing · 15m");
    const logged = e.state.log.length;
    wait(e, 0.25);
    expect(e.state.log.slice(0, e.state.log.length - logged).some((l) => l.text === "The corn is ripe.")).toBe(true);
    expect(row(e, "corn_field")).toMatchObject({ word: "ripe", action: { label: "harvest" } });
    act(e, "corn_field", "collect");
    expect(e.state.items.corn).toBeGreaterThanOrEqual(6);
    expect(row(e, "corn_field")).toMatchObject({ word: "dug", action: { label: "sow", enabled: true } });
  });

  it("every building of the game can be built where it belongs, and its cycle started and collected", () => {
    for (const b of reg.buildings.values()) {
      const e = ready(b.places[0].region);
      if (b.places[0].region === "beach" && b.id !== "shelter") e.applyEffects([{ build: "shelter" }]); // the bed and the barrel go by the shelter
      expect(build(e, b.id), `${b.id}: build`).toMatchObject({ ok: true });
      if (!b.cycle) continue;
      // the corn field is sown as it is dug; the others start with their own step
      if (e.state.buildings[`${b.id}@${b.places[0].region}`].startedAt === undefined) {
        expect(act(e, b.id, "start"), `${b.id}: start`).toMatchObject({ ok: true });
      }
      wait(e, b.cycle.hours * (b.cycle.batches ?? 1));
      e.state.stats = { health: 100, energy: 100, hunger: 0, thirst: 50 };
      const items = JSON.stringify(e.state.items), thirst = e.state.stats.thirst;
      expect(act(e, b.id, "collect"), `${b.id}: collect`).toMatchObject({ ok: true });
      // something came of it: items, or a drink (the rain barrel), or nothing caught this time (snares)
      if (b.id !== "snares") expect(JSON.stringify(e.state.items) !== items || e.state.stats.thirst < thirst, `${b.id}: a yield`).toBe(true);
    }
  });

  it("built places show on the map's hover icons", () => {
    const e = ready("beach");
    build(e, "shelter");
    expect(view(e).tabs.find((t) => t.id === "beach")!.icons).toContain("shelter");
  });

  it("conditions name buildings: { built }, { building, is }", () => {
    const e = ready("meadows");
    const ctx = e.ctx();
    const ev = (c: object) => import("../src/core/conditions").then((m) => m.evaluate(c as never, ctx));
    return Promise.all([
      ev({ built: "corn_field" }).then((v) => expect(v).toBe(false)),
    ]).then(() => {
      build(e, "corn_field");
      return import("../src/core/conditions").then((m) => {
        expect(m.evaluate({ built: "corn_field" }, e.ctx())).toBe(true);
        expect(m.evaluate({ building: "corn_field", is: "working" }, e.ctx())).toBe(true);
        e.state.location = "beach"; // elsewhere: the one built
        expect(m.evaluate({ building: "corn_field", is: "working" }, e.ctx())).toBe(true);
      });
    });
  });

  it("old saves without buildings still load", () => {
    const old = structuredClone(startGame(reg, 5).state) as Partial<GameState>;
    delete old.buildings;
    const e = new Engine(reg, old as GameState);
    expect(view(e).buildings).toEqual([]);
  });

  it("the validator checks buildings, their conditions and tasks that build them", () => {
    const files = readContentFiles();
    const list = structuredClone(files["content/buildings/camp.json"]) as Array<Record<string, unknown>>;
    list[0].places = [{ region: "atlantis" }];
    files["content/buildings/camp.json"] = list;
    const quests = structuredClone(files["content/quests/first-days.json"]) as Array<Record<string, unknown>>;
    quests.find((q) => q.id === "build_shelter")!.build = "castle";
    quests.find((q) => q.id === "make_bed")!.completeWhen = { building: "shelter", is: "ready" }; // the shelter has no cycle
    quests.find((q) => q.id === "cut_logs")!.needs = ["castle"];
    files["content/quests/first-days.json"] = quests;
    const recipes = structuredClone(files["content/recipes/tools.json"]) as Array<Record<string, unknown>>;
    recipes.find((r) => r.id === "craft_spear")!.item = "unobtainium";
    files["content/recipes/tools.json"] = recipes;
    try { buildRegistry(files); throw new Error("expected a ContentError"); } catch (err) {
      expect(err).toBeInstanceOf(ContentError);
      const msg = (err as ContentError).problems.join("\n");
      expect(msg).toMatch(/building shelter\.places\[0\]: unknown region "atlantis"/);
      expect(msg).toMatch(/quest build_shelter\.build: unknown building "castle"/);
      expect(msg).toMatch(/building "shelter" has no cycle, so it is never ready/);
      expect(msg).toMatch(/quest cut_logs\.needs: unknown item or building "castle"/);
      expect(msg).toMatch(/recipe craft_spear\.item: unknown item "unobtainium"/);
    }
  });

  it("each task starts from what you find or do", () => {
    const e = startGame(reg, 6);
    const has = (q: string) => !!e.state.quests[q];
    const find = (region: string, id: string) => { e.state.regions[region].discoveries.push(id); e.syncQuests(); };
    find("meadows", "field_site");
    expect([has("build_corn_field"), has("cut_logs")]).toEqual([true, true]); // the hoe needs a log, logs an axe
    find("meadows", "bees");
    find("meadows", "river");
    find("forest", "rabbit_runs");
    find("forest", "fallen_oak");
    expect(["build_bee_hive", "build_fish_trap", "first_catch", "build_snares", "build_mushroom_logs"].map(has)).toEqual([true, true, true, true, true]);
    expect(has("build_drying_rack")).toBe(false);
    e.state.counters["did:catch_river_fish"] = 1;
    e.syncQuests();
    expect(has("build_drying_rack")).toBe(true);
    expect(has("build_fish_weir")).toBe(false);
    e.state.counters["did:empty_trap"] = 2;
    e.syncQuests();
    expect(has("build_fish_weir")).toBe(true);
    expect(has("make_bed") || has("build_rain_barrel")).toBe(false);
    e.applyEffects([{ build: "shelter" }]);
    e.syncQuests();
    expect([has("make_bed"), has("build_rain_barrel")]).toEqual([true, true]);
  });

  it("the forest's trails show from the second day, the fallen oak after collecting wood a few times", () => {
    const e = startGame(reg, 7);
    e.state.regions.forest.unlocked = true;
    e.dispatch({ type: "travel", region: "forest" });
    const open = () => e.openLandmarks(e.reg.regions.get("forest")!).map((d) => d.id);
    expect(open()).toEqual(["spring"]);
    for (let i = 0; i < 3; i++) { e.state.stats = { health: 100, energy: 100, hunger: 0, thirst: 0 }; e.dispatch({ type: "activity", id: "gather_wood" }); }
    expect(open()).toEqual(["spring", "fallen_oak"]);
    e.state.time += 24 * 60;
    expect(open()).toEqual(["spring", "rabbit_runs", "fallen_oak"]);
  });
});

describe("the craft and build menus", () => {
  it("craft and build: hidden at first; they appear next to look around once there is something, then stay everywhere", () => {
    const e = startGame(reg, 8);
    const menu = () => view(e).actions.find((a) => a.id === "menu:craft");
    expect(view(e).actions.map((a) => a.id)).toEqual(["explore:beach"]); // nothing to make yet
    for (let i = 0; i < 4; i++) lookAround(e); // the shallows: fish, so the spear recipe
    expect(view(e).actions.slice(0, 2).map((a) => a.id)).toEqual(["explore:beach", "menu:craft"]);
    expect(menu()).toMatchObject({ label: "craft", menu: true, badge: undefined });
    e.applyEffects([{ give: { firewood: 10 } }]);
    expect(menu()!.badge).toBe("*");
    // the pop-up: one button per thing, with its time; what it needs is in the tooltip; no time passes
    const t0 = e.state.time;
    e.dispatch({ type: "menu", menu: "craft" });
    expect(view(e).event).toMatchObject({ id: "menu:craft", title: "Craft" });
    expect(view(e).event!.choices).toEqual([
      { id: "craft_spear", label: "fishing spear", enabled: true, reason: undefined, time: "30m", tooltip: "10 firewood · 30m" },
      { id: "close", label: "back", enabled: true },
    ]);
    expect(e.state.time).toBe(t0);
    // making it closes the pop-up and takes its time; the spear leaves the menu (one is enough)
    const res = e.dispatch({ type: "choose", choice: "craft_spear" });
    expect(res.ok).toBe(true);
    expect(res.cooldownMs).toBeGreaterThan(0); // the progress bar runs, as for any action
    expect(e.state.time - t0).toBe(30);
    expect(e.state.items.fishing_spear).toBe(1);
    expect(menu()!.badge).toBeUndefined();
    e.dispatch({ type: "menu", menu: "craft" });
    expect(view(e).event!.choices.map((c) => c.id)).toEqual(["close"]); // the spear has left the menu
    e.dispatch({ type: "choose", choice: "close" });
    e.state.regions.forest.unlocked = true;
    e.dispatch({ type: "travel", region: "forest" });
    expect(menu()).toBeDefined(); // it stays, everywhere
    expect(view(e).actions.map((a) => a.id)).not.toContain("menu:build"); // nothing to build anywhere yet
    e.state.quests.survive_first_night.status = "done"; // the shelter task: something to build (on the beach)
    e.syncQuests();
    e.dispatch({ type: "activity", id: "gather_wood" });
    expect(view(e).actions.map((a) => a.id)).toContain("menu:build"); // shown in the forest too: it says there is nothing here
  });

  it("without a knife: the spear needs one; a rock knife (2 stones, 3 hours) stands in for it, at half the speed", () => {
    const e = startGame(reg, 9, "matches");
    for (let i = 0; i < 4; i++) lookAround(e);
    e.applyEffects([{ give: { firewood: 10 } }]);
    e.dispatch({ type: "menu", menu: "craft" });
    expect(view(e).event!.choices[0]).toMatchObject({ id: "craft_rock_knife", enabled: false, reason: "Needs 2 stones (have 0)" });
    e.dispatch({ type: "choose", choice: "close" });
    // the stones lie under the cliff: picking them up is offered now that a knife is needed
    expect(view(e).actions.map((a) => a.id)).toContain("collect_stones");
    e.dispatch({ type: "activity", id: "collect_stones" });
    expect(e.state.items.stone).toBeGreaterThanOrEqual(2);
    e.state.items.stone = 2;
    e.dispatch({ type: "menu", menu: "craft" });
    expect(view(e).event!.choices.slice(0, 2)).toEqual([
      { id: "craft_rock_knife", label: "rock knife", enabled: true, reason: undefined, time: "3h", tooltip: "2 stones · 3h" },
      { id: "craft_spear", label: "fishing spear", enabled: false, reason: "Needs a knife. Without one, grind two stones into a rock knife first", time: "30m", tooltip: "10 firewood · 30m" },
    ]);
    e.dispatch({ type: "choose", choice: "close" });
    let t0 = e.state.time;
    craft(e, "craft_rock_knife");
    expect(e.state.time - t0).toBe(180);
    expect(e.state.items.stone).toBe(0);
    expect(view(e).inventory.map((i) => i.id)).toContain("rock_knife");
    e.dispatch({ type: "menu", menu: "craft" });
    // the rock knife is had (it leaves the menu); the spear now takes twice as long
    expect(view(e).event!.choices).toEqual([
      { id: "craft_spear", label: "fishing spear", enabled: true, reason: undefined, time: "1h", tooltip: "10 firewood · 1h" },
      { id: "close", label: "back", enabled: true },
    ]);
    e.dispatch({ type: "choose", choice: "close" });
    t0 = e.state.time;
    craft(e, "craft_spear");
    expect(e.state.time - t0).toBe(60);
    expect(e.state.log.some((l) => /rock knife|stone blade/.test(l.text))).toBe(true);
  });

  it("with the knife from the ship, the rock knife is never offered (nor the stones, yet)", () => {
    const e = startGame(reg, 9, "knife");
    for (let i = 0; i < 4; i++) lookAround(e);
    expect(view(e).actions.map((a) => a.id)).not.toContain("collect_stones");
    e.dispatch({ type: "menu", menu: "craft" });
    expect(view(e).event!.choices.map((c) => c.id)).toEqual(["craft_spear", "close"]);
  });

  it("a stand-in tool works wherever the tool is needed, and doubles the time (activities too)", () => {
    const files = readContentFiles();
    const forest = structuredClone(files["content/regions/forest.json"]) as { activities: unknown[] };
    forest.activities.push({ id: "whittle", name: "whittle", hours: 1, effort: "light", requires: { item: "knife" } });
    files["content/regions/forest.json"] = forest;
    const r2 = buildRegistry(files);
    const e = startGame(r2, 12, "water");
    e.state.regions.forest.unlocked = true;
    e.dispatch({ type: "travel", region: "forest" });
    const whittle = () => view(e).actions.find((a) => a.id === "whittle")!;
    expect(whittle()).toMatchObject({ enabled: false, reason: "Needs a knife or a rock knife" });
    e.applyEffects([{ give: { rock_knife: 1 } }]);
    expect(whittle()).toMatchObject({ enabled: true, tooltip: ["2h · light"] });
    const t0 = e.state.time;
    e.dispatch({ type: "activity", id: "whittle" });
    expect(e.state.time - t0).toBe(120);
    e.applyEffects([{ give: { knife: 1 } }]); // the real knife: back to its own time
    expect(whittle().tooltip).toEqual(["1h · light"]);
  });


  it("a menu with nothing in it says so (only close); while it is open nothing else works", () => {
    const e = startGame(reg, 10);
    e.dispatch({ type: "menu", menu: "craft" });
    expect(view(e).event).toMatchObject({ title: "Craft", text: "Nothing comes to mind that you could make yet.", choices: [{ id: "close" }] });
    e.dispatch({ type: "choose", choice: "close" });
    e.dispatch({ type: "menu", menu: "build" });
    expect(view(e).event).toMatchObject({ title: "Build", text: "There is nothing you could build here yet.", choices: [{ id: "close" }] });
    e.dispatch({ type: "choose", choice: "close" });
    const f = ready("beach");
    f.dispatch({ type: "menu", menu: "build" });
    expect(f.dispatch({ type: "activity", id: "collect_shells" })).toMatchObject({ ok: false, reason: "an event is open" });
    expect(f.dispatch({ type: "choose", choice: "castle" }).ok).toBe(false);
  });

  it("crafting finishes no task by itself: the tools serve tasks that need them", () => {
    const e = startGame(reg, 11, "knife", { keepNotes: true });
    for (let i = 0; i < 4; i++) lookAround(e);
    e.state.events.notes = [];
    e.applyEffects([{ give: { firewood: 10 } }]);
    craft(e, "craft_spear");
    expect(view(e).event).toBeNull(); // no note
    expect(e.state.quests.first_catch.status).toBe("active");
    expect(view(e).quests.find((q) => q.id === "first_catch")!.needs[0][0]).toEqual({ label: "fishing spear", have: true });
  });

});

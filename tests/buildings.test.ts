import { restoreState } from "../src/persistence/migrate";
import { describe, expect, it } from "vitest";
import { buildRegistry, ContentError } from "../src/content/registry";
import { Engine } from "../src/core/engine";
import { view } from "../src/core/selectors";
import type { GameState } from "../src/core/state";
import { loadRegistry, lookAround, readContentFiles, revealAll, startGame, unlockTechnology, craft, build } from "./helpers";

const reg = loadRegistry();
type Step = "start" | "collect";
const act = (e: Engine, id: string, step: Step) => e.dispatch({ type: "building", id, step });
const row = (e: Engine, id: string) => view(e).buildings.find((b) => b.id === id);
/** Complete tree stays visible, including unavailable local sites and limits. */
function buildMenu(e: Engine) { return view(e).trees.build.nodes; }
/** Let game hours pass, staying fed and watered (a long wait would kill you otherwise). */
function wait(e: Engine, hours: number) {
  for (let left = hours; left > 0; left -= Math.min(left, 6)) {
    e.state.stats = { ...e.state.stats, health: 100, hunger: 0, thirst: 0 };
    e.advance(Math.min(left, 6), "sleep");
  }
}
const plenty = { timber: 20, stone: 20, firewood: 20, willow_twigs: 80, cordage: 5, corn: 10, raw_fish: 6, berries: 6, axe: 1, hoe: 1 };

/** Everything found and every task started, standing in `region` with plenty of materials. */
function ready(region: string, seed = 1) {
  const e = unlockTechnology(revealAll(startGame(reg, seed)));
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
    e.dispatch({ type: "travel", region: "forest" });
    const ids = view(e).quests.map((q) => q.id);
    expect(ids).toContain("build_shelter");
    expect(ids).toContain("cut_logs"); // the shelter needs logs, logs need an axe
    e.applyEffects([{ give: { stone: 6, timber: 2, firewood: 8 } }]);
    e.state.location = "beach";
    expect(build(e, "campfire").ok).toBe(true);
    expect(build(e, "bed").ok).toBe(true);
    expect(craft(e, "craft_rock_knife").ok).toBe(true);
    e.state.location = "forest";
    e.state.items.timber = 0;
    e.state.time = 8 * 60;
    e.state.stats.energy = 100;
    // the task has no button: the shelter is in the build menu, with what it needs
    expect(buildMenu(e).find((c) => c.target === "shelter")).toMatchObject({ enabled: false, reason: "needs 4 logs (have 0)" });
    // stones under the cliff, firewood from the forest, then the axe
    expect(view(e).actions.map((a) => a.id)).toContain("gather_wood");
    e.applyEffects([{ give: { stone: 2, firewood: 2 } }]);
    craft(e, "craft_axe");
    expect(e.state.items.axe).toBe(1);
    expect(view(e).actions.map((a) => a.label)).toContain("chop wood");
    e.dispatch({ type: "activity", id: "chop_wood" });
    e.dispatch({ type: "activity", id: "chop_wood" });
    expect(e.state.items.timber).toBeGreaterThanOrEqual(4);
    // it is built where it belongs: not in the forest
    expect(buildMenu(e).map((c) => c.target)).toContain("shelter");
    const cold = e.feltTemperature();
    expect(build(e, "shelter").ok).toBe(true);
    expect(buildMenu(e).find((c) => c.target === "shelter")!.enabled).toBe(false); // one is enough: it leaves the menu
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
      e.state.timers[`fire@${e.state.location}`] = 0;
      e.state.time = 22 * 60;
      e.state.stats.energy = 0;
      const res = e.dispatch({ type: "activity", id: "sleep" });
      return { ok: res.ok, energy: e.state.stats.energy };
    };
    expect(sleepFrom([])).toEqual({ ok: false, energy: 0 }); // voluntary sleep needs a bed
    const shelter = sleepFrom(["shelter"]);
    expect(shelter.ok).toBe(false);
    const bed = sleepFrom(["shelter", "bed"]);
    expect(bed.energy).toBeGreaterThan(shelter.energy);
  });

  it("the fish trap: 20 willow twigs from the river, 1 fish every 2 hours up to 3, stays set", () => {
    const e = startGame(reg, 2);
    e.state.regions.meadows.unlocked = true;
    e.dispatch({ type: "travel", region: "meadows" });
    for (const id of ["berry_bushes", "river"]) { e.dispatch({ type: "explore" }); e.dispatch({ type: "choose", choice: id }); e.dispatch({ type: "choose", choice: "close" }); }
    expect(view(e).quests.map((q) => q.id)).toContain("build_fish_trap");
    e.applyEffects([{ give: { stone: 2 } }]);
    expect(build(e, "campfire").ok).toBe(true);
    const t0 = e.state.time;
    e.dispatch({ type: "activity", id: "cut_willow" });
    expect(e.state.time - t0).toBe(30);
    expect(e.state.items.willow_twigs).toBe(10);
    e.dispatch({ type: "activity", id: "cut_willow" });
    expect(row(e, "fish_trap")).toBeUndefined(); // not built yet: it is in the build menu
    expect(buildMenu(e).find((c) => c.target === "fish_trap")).toMatchObject({ label: "fish trap", enabled: true, hints: ["1h · work"] });
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
    expect(buildMenu(e).find((c) => c.target === "fish_trap")).toMatchObject({ label: "fish trap", count: 1, limit: 3 });
    build(e, "fish_trap");
    build(e, "fish_trap");
    expect(row(e, "fish_trap")).toMatchObject({ label: "fish trap ×3", count: 3 });
    expect(buildMenu(e).find((c) => c.target === "fish_trap")!.enabled).toBe(false); // 3 is the most: it leaves the menu
    // setting and emptying all three takes three times as long; each batch is a fish per trap
    const t0 = e.state.time;
    act(e, "fish_trap", "start");
    expect(e.state.time - t0).toBe(45);
    wait(e, 4);
    const fish = e.state.items.raw_fish ?? 0;
    act(e, "fish_trap", "collect");
    expect(e.state.items.raw_fish).toBe(fish + 6); // 2 batches x 3 traps
    e.state.location = "beach";
    expect(buildMenu(e).find((c) => c.target === "fish_trap")).toMatchObject({ label: "fish trap" }); // another place, its own
    build(e, "fish_trap");
    expect(Object.keys(e.state.buildings).filter((k) => k.startsWith("fish_trap@")).sort()).toEqual(["fish_trap@beach", "fish_trap@meadows"]);
    e.state.location = "forest";
    expect(buildMenu(e).find((c) => c.target === "fish_trap")!.enabled).toBe(false); // no fish here
  });

  it("the corn field: dug with a hoe and sown with wild corn; ripe in 3 days; harvest, then sow again", () => {
    const e = ready("meadows");
    e.state.items.hoe = 0;
    expect(buildMenu(e).find((c) => c.target === "corn_field")).toMatchObject({ enabled: false, reason: "needs 1 hoe" });
    e.state.items.hoe = 1;
    e.state.items.corn = 2;
    build(e, "corn_field");
    expect(e.state.items.corn).toBe(0);
    expect(row(e, "corn_field")!.word).toBe("growing · 3d"); // sown as it was dug
    wait(e, 71.75);
    expect(row(e, "corn_field")!.word).toBe("growing · 15m");
    const logged = e.state.log.length;
    wait(e, 0.25);
    expect(e.state.log.slice(0, e.state.log.length - logged).some((l) => l.text === "The corn has reached maturity and may be harvested.")).toBe(true);
    expect(row(e, "corn_field")).toMatchObject({ word: "ripe", action: { label: "harvest" } });
    act(e, "corn_field", "collect");
    expect(e.state.items.corn).toBeGreaterThanOrEqual(6);
    expect(row(e, "corn_field")).toMatchObject({ word: "dug", action: { label: "sow", enabled: true } });
  });

  it("every building of the game can be built where it belongs, and its cycle started and collected", () => {
    for (const b of reg.buildings.values()) {
      const place = ({ shelter: "forest", snares: "forest", corn_field: "meadows", bee_hive: "meadows", fish_weir: "meadows" } as Record<string, string>)[b.id] ?? "beach";
      const e = ready(place);
      if (place === "beach" && b.id !== "shelter") e.applyEffects([{ build: "shelter" }]); // the bed and the barrel go by the shelter
      expect(build(e, b.id), `${b.id}: build`).toMatchObject({ ok: true });
      if (!b.cycle) continue;
      // the corn field is sown as it is dug; the others start with their own step
      if (e.state.buildings[`${b.id}@${place}`].batches.length === 0) {
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
    e.applyEffects([{ build: "shelter" }]);
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
    const e = new Engine(reg, restoreState(old, reg)!);
    expect(view(e).buildings).toEqual([]);
  });

  it("the validator checks buildings, their conditions and tasks that build them", () => {
    const files = readContentFiles();
    const list = structuredClone(files["content/buildings/camp.json"]) as Array<Record<string, unknown>>;
    (list[0].build as Record<string, unknown>).requires = { site: "atlantis" };
    files["content/buildings/camp.json"] = list;
    const quests = structuredClone(files["content/quests/first-days.json"]) as Array<Record<string, unknown>>;
    quests.find((q) => q.id === "build_shelter")!.completeWhen = { built: "castle" };
    quests.find((q) => q.id === "make_bed")!.completeWhen = { building: "shelter", is: "ready" }; // the shelter has no cycle
    files["content/quests/first-days.json"] = quests;
    const recipes = structuredClone(files["content/recipes/tools.json"]) as Array<Record<string, unknown>>;
    recipes.find((r) => r.id === "craft_spear")!.item = "unobtainium";
    files["content/recipes/tools.json"] = recipes;
    try { buildRegistry(files); throw new Error("expected a ContentError"); } catch (err) {
      expect(err).toBeInstanceOf(ContentError);
      const msg = (err as ContentError).problems.join("\n");
      expect(msg).toMatch(/building shelter\.build.requires: unknown site "atlantis"/);
      expect(msg).toMatch(/quest build_shelter\.completeWhen: unknown building "castle"/);
      expect(msg).toMatch(/building "shelter" has no cycle, so it is never ready/);
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
    expect(["build_bee_hive", "build_fish_trap", "first_catch", "build_snares"].map(has)).toEqual([true, true, true, true]);
    expect(has("build_drying_rack")).toBe(false);
    e.state.counters["did:catch_river_fish"] = 1;
    e.syncQuests();
    expect(has("build_drying_rack")).toBe(false); // catching fish alone is not the trigger
    e.applyEffects([{ give: { raw_fish: 1 } }]);
    e.state.stats.hunger = 60;
    e.dispatch({ type: "explore" });
    expect(has("build_drying_rack")).toBe(true);
    e.dispatch({ type: "choose", choice: "close" });
    expect(has("build_fish_weir")).toBe(false);
    e.state.counters["did:empty_trap"] = 2;
    e.syncQuests();
    expect(has("build_fish_weir")).toBe(true);
    expect(has("make_bed") || has("build_rain_barrel")).toBe(false);
    e.applyEffects([{ build: "shelter" }]);
    e.syncQuests();
    expect([has("make_bed"), has("build_rain_barrel")]).toEqual([true, true]);
  });

  it("the forest trails show on day two", () => {
    const e = startGame(reg, 7);
    e.state.regions.forest.unlocked = true;
    e.dispatch({ type: "travel", region: "forest" });
    const open = () => e.openLandmarks(e.reg.regions.get("forest")!).map((d) => d.id);
    expect(open()).toEqual(["spring"]);
    e.state.time += 24 * 60;
    expect(open()).toEqual(["spring", "rabbit_runs"]);
  });
});

describe("tool capability duration", () => {
  it("anything sharp does for 'something sharp'; the rock knife doubles the time (activities too)", () => {
    const files = readContentFiles();
    const forest = structuredClone(files["content/regions/forest.json"]) as { activities: unknown[] };
    forest.activities.push({ id: "whittle", name: "whittle", hours: 1, effort: "light", requires: { tool: "sharp" } });
    files["content/regions/forest.json"] = forest;
    const r2 = buildRegistry(files);
    const e = startGame(r2, 12, "water");
    e.state.regions.forest.unlocked = true;
    e.dispatch({ type: "travel", region: "forest" });
    const whittle = () => view(e).actions.find((a) => a.id === "whittle")!;
    expect(whittle()).toMatchObject({ enabled: false, reason: "Needs something sharp" });
    e.applyEffects([{ give: { rock_knife: 1 } }]);
    expect(whittle()).toMatchObject({ enabled: true, tooltip: ["2h · light"] });
    const t0 = e.state.time;
    e.dispatch({ type: "activity", id: "whittle" });
    expect(e.state.time - t0).toBe(120);
    e.applyEffects([{ give: { knife: 1 } }]); // the knife is quicker: it is used
    expect(whittle().tooltip).toEqual(["1h · light"]);
  });
});

describe("rope creation and the cliff route", () => {
  it("strips bark with the available sharp tool, personally crafts rope, and keeps it after climbing", () => {
    const e = startGame(reg, 13, "matches");
    for (let i = 0; i < 3; i++) lookAround(e); // dunes, natural shelter, cliff
    expect(e.state.quests.climb_cliff.status).toBe("active");
    expect(e.dispatch({ type: "activity", id: "collect_stones" }).ok).toBe(true);
    expect(craft(e, "craft_rock_knife").ok).toBe(true);
    expect(e.state.technology.craft.unlocked).toContain("craft_rope");
    expect(e.dispatch({ type: "travel", region: "forest" }).ok).toBe(true);
    const strip = () => view(e).actions.find((a) => a.id === "strip_bark")!;
    expect(strip()).toMatchObject({ enabled: true, tooltip: ["2h · work"] });
    e.applyEffects([{ give: { knife: 1 } }]);
    expect(strip().tooltip).toEqual(["1h · work"]);
    e.state.stats.energy = 100;
    let start = e.state.time;
    expect(e.dispatch({ type: "activity", id: "strip_bark" }).ok).toBe(true);
    expect(e.state.time - start).toBe(60);
    expect(e.state.items.bark_strips).toBe(4);
    const recipe = () => view(e).trees.craft.nodes.find((n) => n.target === "craft_rope")!;
    expect(recipe()).toMatchObject({ enabled: true, completed: false });
    start = e.state.time;
    expect(craft(e, "craft_rope").ok).toBe(true);
    expect(e.state.time - start).toBe(180);
    expect(e.state.items.bark_strips).toBe(0);
    expect(e.state.items.cordage).toBe(1);
    expect(recipe()).toMatchObject({ completed: true, unlocked: true, enabled: false });
    expect(view(e).inventory.find((item) => item.id === "cordage")).toMatchObject({ label: "rope", count: 1 });
    expect(e.dispatch({ type: "activity", id: "strip_bark" }).ok).toBe(true);
    expect(recipe()).toMatchObject({ completed: true, enabled: true });
    e.state.stats.energy = 100;
    expect(e.dispatch({ type: "travel", region: "beach" }).ok).toBe(true);
    lookAround(e); // the shallows precede the cliff top
    lookAround(e);
    expect(e.state.regions.meadows.unlocked).toBe(true);
    expect(e.state.items.cordage).toBe(1);
    expect(e.state.quests.climb_cliff.status).toBe("done");
    expect(e.state.technology.craft.completed).toEqual(["craft_rock_knife", "craft_rope"]);
  });
});

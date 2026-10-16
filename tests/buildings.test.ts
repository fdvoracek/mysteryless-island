import { describe, expect, it } from "vitest";
import { buildRegistry, ContentError } from "../src/content/registry";
import { Engine } from "../src/core/engine";
import { view } from "../src/core/selectors";
import type { GameState } from "../src/core/state";
import { loadRegistry, lookAround, readContentFiles, revealAll, startGame } from "./helpers";

const reg = loadRegistry();
type Step = "build" | "start" | "collect";
const act = (e: Engine, id: string, step: Step) => e.dispatch({ type: "building", id, step });
const row = (e: Engine, id: string) => view(e).buildings.find((b) => b.id === id);
/** Let game hours pass, staying fed and watered (a long wait would kill you otherwise). */
function wait(e: Engine, hours: number) {
  for (let left = hours; left > 0; left -= Math.min(left, 6)) {
    e.state.stats = { ...e.state.stats, health: 100, hunger: 0, thirst: 0 };
    e.advance(Math.min(left, 6), "rest");
  }
}
const plenty = { timber: 20, stone: 20, firewood: 20, willow_twigs: 40, cordage: 5, corn: 10, raw_fish: 6, berries: 6, axe: 1, hoe: 1 };

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
    expect(ids).toContain("make_axe"); // the shelter needs logs
    const task = view(e).quests.find((q) => q.id === "build_shelter")!;
    expect(task.progress).toEqual([{ label: "logs", have: 0, need: 4 }]);
    expect(task.action).toMatchObject({ label: "build", enabled: false, reason: "Needs 4 logs (have 0)" });
    // stones under the cliff, firewood from the forest, then the axe
    expect(view(e).actions.map((a) => a.id)).toContain("collect_stones");
    e.applyEffects([{ give: { stone: 2, firewood: 2 } }]);
    e.dispatch({ type: "questAction", quest: "make_axe" });
    expect(e.state.items.axe).toBe(1);
    e.dispatch({ type: "travel", region: "forest" });
    expect(view(e).actions.map((a) => a.label)).toContain("chop wood");
    e.dispatch({ type: "activity", id: "chop_wood" });
    e.dispatch({ type: "activity", id: "chop_wood" });
    expect(e.state.items.timber).toBeGreaterThanOrEqual(4);
    // the task's button builds where you are: not in the forest
    expect(view(e).quests.find((q) => q.id === "build_shelter")!.action).toMatchObject({ enabled: false, reason: "Only in the beach" });
    e.dispatch({ type: "travel", region: "beach" });
    const cold = e.feltTemperature();
    expect(e.dispatch({ type: "questAction", quest: "build_shelter" }).ok).toBe(false); // not a quest action
    expect(e.dispatch({ type: "building", id: "shelter", step: "build" }).ok).toBe(true);
    expect(e.feltTemperature()).toBe(cold + 3);
    expect(row(e, "shelter")).toMatchObject({ label: "shelter", built: true, word: "standing" });
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
    expect(row(e, "fish_trap")).toBeUndefined(); // the task has the button while it is open
    expect(view(e).quests.find((q) => q.id === "build_fish_trap")).toMatchObject({ progress: [{ label: "willow twigs", have: 20, need: 20 }], action: { label: "build", enabled: true } });
    expect(act(e, "fish_trap", "build").ok).toBe(true);
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

  it("a fish trap can stand wherever you can fish: one on the beach and one in the river", () => {
    const e = ready("meadows");
    act(e, "fish_trap", "build");
    e.state.location = "beach";
    expect(row(e, "fish_trap")).toMatchObject({ built: false, word: "not built", action: { label: "build" } }); // the task is done: the panel offers it
    act(e, "fish_trap", "build");
    expect(Object.keys(e.state.buildings).filter((k) => k.startsWith("fish_trap@")).sort()).toEqual(["fish_trap@beach", "fish_trap@meadows"]);
    e.state.location = "forest";
    expect(row(e, "fish_trap")).toBeUndefined(); // no fish here
  });

  it("the corn field: dug with a hoe and sown with wild corn; ripe in 3 days; harvest, then sow again", () => {
    const e = ready("meadows");
    e.state.items.hoe = 0;
    const task = () => view(e).quests.find((q) => q.id === "build_corn_field")!;
    expect(task().action).toMatchObject({ label: "dig", enabled: false, reason: "Needs a hoe to break the ground" });
    e.state.items.hoe = 1;
    e.state.items.corn = 2;
    act(e, "corn_field", "build");
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
      expect(act(e, b.id, "build"), `${b.id}: build`).toMatchObject({ ok: true });
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
    act(e, "shelter", "build");
    expect(view(e).tabs.find((t) => t.id === "beach")!.icons).toContain("shelter");
  });

  it("conditions name buildings: { built }, { building, is }", () => {
    const e = ready("meadows");
    const ctx = e.ctx();
    const ev = (c: object) => import("../src/core/conditions").then((m) => m.evaluate(c as never, ctx));
    return Promise.all([
      ev({ built: "corn_field" }).then((v) => expect(v).toBe(false)),
    ]).then(() => {
      act(e, "corn_field", "build");
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
    files["content/quests/first-days.json"] = quests;
    try { buildRegistry(files); throw new Error("expected a ContentError"); } catch (err) {
      expect(err).toBeInstanceOf(ContentError);
      const msg = (err as ContentError).problems.join("\n");
      expect(msg).toMatch(/building shelter\.places\[0\]: unknown region "atlantis"/);
      expect(msg).toMatch(/quest build_shelter\.build: unknown building "castle"/);
      expect(msg).toMatch(/building "shelter" has no cycle, so it is never ready/);
    }
  });

  it("each task starts from what you find or do", () => {
    const e = startGame(reg, 6);
    const has = (q: string) => !!e.state.quests[q];
    const find = (region: string, id: string) => { e.state.regions[region].discoveries.push(id); e.syncQuests(); };
    find("meadows", "field_site");
    expect([has("build_corn_field"), has("make_hoe"), has("make_axe")]).toEqual([true, true, true]); // hoe: logs: axe
    find("meadows", "bees");
    find("meadows", "river");
    find("forest", "rabbit_runs");
    find("forest", "fallen_oak");
    expect(["build_bee_hive", "build_fish_trap", "build_snares", "build_mushroom_logs"].map(has)).toEqual([true, true, true, true]);
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

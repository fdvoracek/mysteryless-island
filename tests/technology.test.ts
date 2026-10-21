import { describe, expect, it } from "vitest";
import { buildRegistry, type Registry } from "../src/content/registry";
import type { Building, Condition, CreationTree, Item, Recipe } from "../src/content/schema";
import { Engine } from "../src/core/engine";
import { evaluate } from "../src/core/conditions";
import { treeView } from "../src/core/selectors";
import { restoreState } from "../src/persistence/migrate";
import { build, craft, loadRegistry, lookAround, readContentFiles, revealAll, startGame } from "./helpers";

const reg = loadRegistry();
function fresh(content: Registry = reg) {
  const e = revealAll(startGame(content, 7));
  e.state.time = 8 * 60;
  e.state.stats = { health: 100, energy: 100, hunger: 0, thirst: 0 };
  return e;
}
function finish(e: Engine) {
  for (let i = 0; e.runningActions().length && i < 100; i++) {
    e.stepActions();
    if (e.state.events.active?.kind === "note") e.dispatch({ type: "choose", choice: "close" });
  }
  expect(e.state.actions).toEqual([]);
}
function reload(e: Engine) {
  const state = restoreState(JSON.parse(JSON.stringify(e.state)), e.reg);
  expect(state).not.toBeNull();
  return new Engine(e.reg, state!);
}

describe("personal creation progression", () => {
  it("unlocks only roots, and grants or equivalent tools never complete a node", () => {
    const e = startGame(reg, 7);
    expect(e.state.technology).toEqual({
      craft: { completed: [], unlocked: ["craft_rock_knife"] },
      build: { completed: [], unlocked: ["campfire"] },
    });
    e.applyEffects([{ give: { rock_knife: 1, axe: 1 } }, { build: "campfire" }]);
    expect(e.state.technology.craft.completed).toEqual([]);
    expect(e.state.technology.build.completed).toEqual([]);
    expect(craft(e, "craft_axe")).toMatchObject({ ok: false });
    expect(build(e, "bed")).toMatchObject({ ok: false });
  });

  it("completes only finished work, unlocks children without completing them, and survives reload", () => {
    const e = fresh();
    e.state.items.stone = 2;
    const started = e.start({ type: "craft", recipe: "craft_rock_knife" });
    expect(started.ok).toBe(true);
    e.stepActions();
    expect(e.state.technology.craft.completed).toEqual([]);
    expect(e.state.technology.craft.unlocked).not.toContain("craft_axe");
    e.start({ type: "pause", id: started.workId! });
    const loaded = reload(e);
    expect(loaded.state.actions[0].reserved).toEqual({ stone: 2 });
    expect(loaded.state.technology.craft.completed).toEqual([]);
    expect(loaded.start({ type: "craft", recipe: "craft_rock_knife" }).ok).toBe(true);
    finish(loaded);
    expect(loaded.state.technology.craft.completed).toEqual(["craft_rock_knife"]);
    expect(loaded.state.technology.craft.unlocked).toEqual(expect.arrayContaining(["craft_axe", "craft_rope", "craft_spear"]));
    expect(loaded.state.technology.craft.unlocked).not.toContain("craft_hoe");
    loaded.state.items.rock_knife = 0;
    loaded.state.location = "forest";
    expect(reload(loaded).state.technology.craft).toEqual(loaded.state.technology.craft);
    loaded.stepActions();
    expect(loaded.state.technology.craft.completed).toEqual(["craft_rock_knife"]);
    expect(loaded.state.technology.build.completed).toEqual([]);
  });

  it("requires every parent across categories without cascading through unlocked descendants", () => {
    const files = readContentFiles();
    const tree = files["content/trees/crafting.json"] as CreationTree;
    tree.nodes.find((n) => n.target === "craft_hoe")!.after = ["craft_axe", "craft_rope"];
    const e = fresh(buildRegistry(files));
    e.applyEffects([{ give: { stone: 6, firewood: 2, bark_strips: 4 } }]);
    expect(craft(e, "craft_rock_knife").ok).toBe(true);
    expect(e.state.technology.craft.unlocked).not.toContain("craft_hoe");
    expect(craft(e, "craft_axe").ok).toBe(true);
    expect(e.state.technology.craft.unlocked).not.toContain("craft_hoe");
    expect(craft(e, "craft_rope").ok).toBe(true);
    expect(e.state.technology.craft.unlocked).toContain("craft_hoe");
    expect(e.state.technology.craft.completed).not.toContain("craft_hoe");
  });

  it.each(["already owned", "found during work", "lost during work"])("first personal craft leaves one exact output when %s", (scenario) => {
    const e = fresh();
    e.state.items.stone = 2;
    if (scenario !== "found during work") e.state.items.rock_knife = 1;
    expect(e.checkRecipe(reg.recipes.get("craft_rock_knife")!).enabled).toBe(true);
    e.start({ type: "craft", recipe: "craft_rock_knife" });
    e.stepActions();
    const id = e.state.actions[0].id;
    e.start({ type: "pause", id });
    e.state.items.rock_knife = scenario === "lost during work" ? 0 : 1;
    const loaded = reload(e);
    expect(loaded.start({ type: "resume", id }).ok).toBe(true);
    finish(loaded);
    expect(loaded.state.items.rock_knife).toBe(1);
    expect(loaded.state.items.stone).toBe(0);
    expect(loaded.state.items.knife).toBe(1);
    expect(loaded.state.technology.craft.completed).toEqual(["craft_rock_knife"]);
    expect(loaded.state.log.some((line) => line.text.includes("Rock knife") || line.text.includes("rock knife"))).toBe(true);
    expect(craft(loaded, "craft_rock_knife")).toMatchObject({ ok: false, reason: "already owned" });
    loaded.state.items.rock_knife = 0;
    loaded.state.items.stone = 2;
    expect(craft(loaded, "craft_rock_knife").ok).toBe(true);
    expect(loaded.state.items.rock_knife).toBe(1);
    expect(loaded.state.technology.craft.completed).toEqual(["craft_rock_knife"]);
  });

  it("preserves repeatable quantities after completion", () => {
    const files = readContentFiles();
    (files["content/recipes/craft_rope.json"] as Recipe).count = 3;
    const e = fresh(buildRegistry(files));
    e.applyEffects([{ give: { stone: 2, bark_strips: 8 } }]);
    craft(e, "craft_rock_knife");
    expect(craft(e, "craft_rope").ok).toBe(true);
    expect(e.state.items.cordage).toBe(3);
    expect(craft(e, "craft_rope").ok).toBe(true);
    expect(e.state.items.cordage).toBe(6);
    expect(e.state.technology.craft.completed.filter((id) => id === "craft_rope")).toHaveLength(1);
  });
});

describe("creation requirements and saved tools", () => {
  it("reports capacity for the whole repeatable output batch in both hints and direct commands", () => {
    const files = readContentFiles();
    (files["content/recipes/craft_rope.json"] as Recipe).count = 3;
    (files["content/items/cordage.json"] as Item).max = 4;
    const e = fresh(buildRegistry(files));
    e.applyEffects([{ give: { stone: 2, bark_strips: 4, cordage: 2 } }]);
    craft(e, "craft_rock_knife");
    const preview = () => treeView(e, "craft").nodes.find((n) => n.target === "craft_rope")!;
    expect(preview()).toMatchObject({ unlocked: true, enabled: false });
    expect(preview().requirements.find((r) => r.kind === "limit")).toMatchObject({ met: false, available: 2, required: 4 });
    expect(craft(e, "craft_rope")).toMatchObject({ ok: false, reason: "inventory limit reached" });
    expect(e.state.items.bark_strips).toBe(4);
    e.state.items.cordage = 1;
    expect(preview().enabled).toBe(true);
    expect(preview().requirements.find((r) => r.kind === "limit")?.met).toBe(true);
    expect(craft(e, "craft_rope").ok).toBe(true);
    expect(e.state.items.cordage).toBe(4);
  });

  it("checks the same tools and materials in previews and direct commands", () => {
    const e = fresh();
    e.applyEffects([{ give: { stone: 2 } }]);
    craft(e, "craft_rock_knife");
    const spear = () => treeView(e, "craft").nodes.find((n) => n.target === "craft_spear")!;
    expect(spear()).toMatchObject({ unlocked: true, enabled: false });
    expect(e.start(spear().command)).toMatchObject({ ok: false });
    e.state.items.firewood = 10;
    e.state.items.knife = e.state.items.rock_knife = 0;
    expect(spear().enabled).toBe(false);
    expect(e.start(spear().command)).toMatchObject({ ok: false });
    e.state.items.knife = 1;
    expect(spear().enabled).toBe(true);
    expect(e.start(spear().command).ok).toBe(true);
    expect(e.state.items.firewood).toBe(0);
    expect(e.start(spear().command)).toMatchObject({ ok: false });
    expect(e.state.actions).toHaveLength(1);
  });

  it.each(["resume", "craft"])("rejects %s with missing tools after reload and resumes with a replacement without repaying", (entry) => {
    const e = fresh();
    e.applyEffects([{ give: { stone: 2, firewood: 10 } }]);
    craft(e, "craft_rock_knife");
    const result = e.start({ type: "craft", recipe: "craft_spear" });
    e.stepActions();
    e.start({ type: "pause", id: result.workId! });
    e.state.items.knife = e.state.items.rock_knife = 0;
    const loaded = reload(e);
    const work = structuredClone(loaded.state.actions[0]);
    const command = entry === "resume" ? { type: "resume" as const, id: work.id } : { type: "craft" as const, recipe: "craft_spear" };
    expect(loaded.start(command)).toMatchObject({ ok: false });
    expect(loaded.state.actions[0]).toEqual(work);
    expect(treeView(loaded, "craft").nodes.find((n) => n.target === "craft_spear")).toMatchObject({ enabled: false });
    loaded.state.items.rock_knife = 1;
    const preview = treeView(loaded, "craft").nodes.find((n) => n.target === "craft_spear")!;
    expect(preview.enabled).toBe(true);
    expect(preview.hints).toContain("30m · light");
    expect(preview.requirements).toContainEqual({ kind: "material", label: "firewood (reserved)", required: 10, available: 10, met: true });
    expect(loaded.start(command).ok).toBe(true);
    expect(loaded.state.actions[0]).toMatchObject({ requiredMinutes: work.requiredMinutes, completedMinutes: work.completedMinutes, reserved: work.reserved, work: work.work });
    finish(loaded);
    expect(loaded.state.items.fishing_spear).toBe(1);
    expect(loaded.state.items.firewood).toBe(0);
  });

  it.each(["resume", "build"])("rechecks construction tools through %s without losing reserved stone", (entry) => {
    const files = readContentFiles();
    const campfire = (files["content/buildings/campfire.json"] as Building);
    campfire.build.hours = 0.5;
    campfire.build.requires = { all: [{ site: "camp_ground" }, { tool: "sharp" }] };
    const e = fresh(buildRegistry(files));
    e.state.items.stone = 2;
    const started = e.start({ type: "build", building: "campfire" });
    expect(started.ok).toBe(true);
    e.stepActions();
    e.start({ type: "pause", id: started.workId! });
    e.state.items.knife = 0;
    const loaded = reload(e);
    const work = structuredClone(loaded.state.actions[0]);
    const command = entry === "resume" ? { type: "resume" as const, id: work.id } : { type: "build" as const, building: "campfire" };
    expect(loaded.start(command).ok).toBe(false);
    expect(loaded.state.actions[0]).toEqual(work);
    expect(loaded.state.technology.build.completed).toEqual([]);
    loaded.state.items.rock_knife = 1;
    expect(loaded.start(command).ok).toBe(true);
    expect(loaded.state.actions[0].requiredMinutes).toBe(30);
    finish(loaded);
    expect(loaded.builtHere("campfire")).toBe(1);
    expect(loaded.state.items.stone).toBe(0);
    expect(loaded.state.technology.build.completed).toEqual(["campfire"]);
  });

  it("captures mixed tool alternatives while freezing consumed-item decisions", () => {
    const files = readContentFiles();
    const recipe = (files["content/recipes/craft_rock_knife.json"] as Recipe);
    const tools: Condition = { all: [{ item: "stone", gte: 2 }, { any: [{ tool: "sharp" }, { not: { tool: "fire_starter" } }] }] };
    recipe.ways[0].requires = tools;
    const e = fresh(buildRegistry(files));
    e.state.items.stone = 2;
    const started = e.start({ type: "craft", recipe: "craft_rock_knife" });
    e.stepActions();
    e.start({ type: "pause", id: started.workId! });
    e.state.items.knife = 0;
    const loaded = reload(e);
    expect(loaded.start({ type: "resume", id: started.workId! }).ok).toBe(false);
    loaded.state.items.matches = 0;
    expect(loaded.start({ type: "resume", id: started.workId! }).ok).toBe(true);
    expect(loaded.state.items.stone).toBe(0);
    finish(loaded);
    expect(loaded.state.technology.craft.completed).toContain("craft_rock_knife");
  });
});

describe("local construction sites and global unlocks", () => {
  it("constructing an unlit fire unlocks beds and traps, but remote or undiscovered fishing sites cannot qualify", () => {
    const e = startGame(reg, 7);
    e.state.items.stone = 2;
    expect(build(e, "campfire").ok).toBe(false);
    lookAround(e); lookAround(e);
    expect(build(e, "campfire").ok).toBe(true);
    expect(e.state.timers["fire@beach"]).toBe(0);
    expect(e.state.technology.build.completed).toEqual(["campfire"]);
    expect(e.state.technology.build.unlocked).toEqual(expect.arrayContaining(["bed", "fish_trap"]));
    expect(evaluate({ site: "fishable_water" }, e.ctx())).toBe(false);
    e.state.items.willow_twigs = 40;
    expect(build(e, "fish_trap").ok).toBe(false);
    e.state.regions.beach.discoveries.push("school_of_fish");
    expect(build(e, "fish_trap").ok).toBe(true);
    expect(e.state.technology.build.unlocked).toContain("snares");
    e.state.location = "meadows";
    expect(evaluate({ site: "fishable_water" }, e.ctx())).toBe(false);
    expect(build(e, "fish_trap").ok).toBe(false);
    e.state.regions.meadows.discoveries.push("river");
    expect(build(e, "fish_trap").ok).toBe(true);
    expect(e.builtHere("fish_trap")).toBe(1);
    expect(e.state.buildings["fish_trap@beach"].count).toBe(1);
    e.state.location = "beach";
    expect(build(e, "corn_field")).toMatchObject({ ok: false });
  });

  it("keeps a remote paused building off the current area's tree progress", () => {
    const e = fresh();
    e.state.items.stone = 4;
    const started = e.start({ type: "build", building: "campfire" });
    e.start({ type: "pause", id: started.workId! });
    expect(treeView(e, "build").nodes.find((n) => n.target === "campfire")?.work?.id).toBe(started.workId);
    e.state.location = "forest";
    expect(treeView(e, "build").nodes.find((n) => n.target === "campfire")?.work).toBeUndefined();
  });
});

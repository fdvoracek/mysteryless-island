import { describe, expect, it } from "vitest";
import { buildRegistry, ContentError } from "../src/content/registry";
import type { Engine } from "../src/core/engine";
import { view } from "../src/core/selectors";
import { loadRegistry, readContentFiles, startGame } from "./helpers";

const reg = loadRegistry();
const open = (e: Engine) => e.dispatch({ type: "explore" });
const choose = (e: Engine, choice: string) => e.dispatch({ type: "choose", choice });
const choices = (e: Engine) => view(e).event!.choices.map((c) => c.id);
const explore = (e: Engine, id: string) => { open(e); choose(e, id); choose(e, "close"); };

describe("look around: a pop-up with what you see and places to explore", () => {
  it("opens without passing time: what you see, the landmarks with their time, and close", () => {
    const e = startGame(reg, 1);
    const t0 = e.state.time;
    expect(open(e)).toMatchObject({ ok: true, cooldownMs: 0 });
    expect(e.state.time).toBe(t0);
    const ev = view(e).event!;
    expect(ev.title).toBe("A Grey Beach");
    expect(ev.text).toMatch(/^The grey strand stretches/);
    expect(ev.text).toContain("Beyond the dunes you distinguish a continuous dark belt of trees.");
    expect(ev.text).toContain("An occasional silver flash betrays movement in the shallow water.");
    expect(ev.choices).toEqual([
      { id: "forest_edge", label: "the dunes", enabled: true, time: "30m", hours: 0.5 },
      { id: "rock_shelter", label: "the ring of rocks", enabled: true, time: "30m", hours: 0.5 },
      { id: "school_of_fish", label: "the shallows", enabled: true, time: "30m", hours: 0.5 },
      { id: "close", label: "back", enabled: true },
    ]);
    // closing without exploring: no time, nothing written
    const logged = e.state.log.length;
    choose(e, "close");
    expect(view(e).event).toBeNull();
    expect(e.state.time).toBe(t0);
    expect(e.state.log.length).toBe(logged);
  });

  it("exploring shows the full modal and leaves a brief account in the journal", () => {
    const e = startGame(reg, 2);
    open(e);
    const t0 = e.state.time;
    expect(choose(e, "rock_shelter")).toMatchObject({ ok: true, cooldownMs: 5_000 });
    expect(e.state.time - t0).toBe(30);
    const ev = view(e).event!;
    expect(ev.text).toMatch(/^At the end of the beach, a natural ring of rocks/);
    expect(ev.choices).toEqual([{ id: "close", label: "back", enabled: true }]);
    expect(e.state.log.some((l) => l.text === "You find sheltered ground among the rocks.")).toBe(true);
    expect(e.state.log.some((l) => l.text === ev.text)).toBe(false);
    choose(e, "close");
    expect(view(e).trees.build.nodes.find((n) => n.target === "campfire")!.unlocked).toBe(true); // natural shelter opens building a bed and campfire
  });

  it("an explored landmark is not offered again; new ones can appear later (the cliff past the rocks)", () => {
    const e = startGame(reg, 3);
    explore(e, "rock_shelter");
    open(e);
    expect(choices(e)).toEqual(["forest_edge", "cliff_shells", "school_of_fish", "close"]);
    expect(view(e).event!.text).toContain("The cluster of rocks at the end of the shore offers a refuge from the prevailing wind.");
    expect(view(e).event!.text).toContain("Past the rocks, a low cliff ends abruptly in the surf.");
    choose(e, "close");
  });

  it("the * shows while something is left; when all is explored, look around stays and says what you see", () => {
    const e = startGame(reg, 4);
    const badge = () => view(e).actions.find((a) => a.id === "explore:beach")!.badge;
    expect(badge()).toBe("*");
    e.applyEffects([{ give: { cordage: 1 } }]); // a rope for the cliff
    for (const id of ["forest_edge", "rock_shelter", "cliff_shells", "school_of_fish", "cliff_top"]) explore(e, id);
    expect(badge()).toBeUndefined();
    open(e);
    expect(choices(e)).toEqual(["close"]);
    expect(view(e).event!.text).toContain("A school of small fish turns and scatters among the shallows.");
    expect(view(e).event!.text).toMatch(/A further survey of the shore reveals no feature overlooked before\.$/);
  });

  it("a landmark that appears later brings the * back", () => {
    const files = readContentFiles();
    const beach = structuredClone(files["content/regions/beach.json"]) as { explore: { landmarks: unknown[] } };
    beach.explore.landmarks.push({ id: "wreckage", label: "the wreckage", hours: 0.5, effort: "work", visibleWhen: { day: { gte: 2 } }, text: "Planks from the ship." });
    files["content/regions/beach.json"] = beach;
    const e = startGame(buildRegistry(files), 5);
    e.applyEffects([{ give: { cordage: 1 } }]); // a rope for the cliff
    for (const id of ["forest_edge", "rock_shelter", "cliff_shells", "school_of_fish", "cliff_top"]) explore(e, id);
    const badge = () => view(e).actions.find((a) => a.id === "explore:beach")!.badge;
    expect(badge()).toBeUndefined();
    e.advance(24, "rest");
    expect(badge()).toBe("*");
    open(e);
    expect(view(e).event!.choices[0]).toMatchObject({ id: "wreckage", time: "30m" });
  });

  it("exploring counts for 'after explore' events, which open when the finding is closed", () => {
    const files = readContentFiles();
    files["content/events/test.json"] = [{ id: "e_gull", title: "A gull", trigger: { after: ["school_of_fish"], chance: 1 }, scenes: { start: { text: "A gull." } } }];
    const e = startGame(buildRegistry(files), 6);
    explore(e, "forest_edge");
    expect(view(e).event).toBeNull(); // another landmark: no event
    open(e);
    choose(e, "school_of_fish");
    expect(view(e).event!.id).toBe("explore:beach"); // the finding first
    choose(e, "close");
    expect(view(e).event!.id).toBe("e_gull");
  });

  it("while the pop-up is open nothing else can be done", () => {
    const e = startGame(reg, 7);
    open(e);
    expect(e.dispatch({ type: "activity", id: "collect_shells" })).toMatchObject({ ok: false, reason: "an event is open" });
    expect(open(e).ok).toBe(false);
  });

  it("exploring can kill you; the pop-up closes with death", () => {
    const e = startGame(reg, 8);
    e.state.stats.health = 1;
    e.state.stats.hunger = 100;
    e.state.warmth = reg.bandIds.indexOf("freezing");
    open(e);
    choose(e, "forest_edge");
    expect(e.state.dead).toBe(true);
    expect(view(e).event).toBeNull();
  });

  it("the validator checks landmark conditions and view conditions", () => {
    const files = readContentFiles();
    const beach = structuredClone(files["content/regions/beach.json"]) as { explore: { view: Array<{ when?: unknown }>; landmarks: Array<{ visibleWhen?: unknown }> } };
    beach.explore.view[1].when = { discovered: "atlantis" };
    beach.explore.landmarks[0].visibleWhen = { item: "unobtainium" };
    files["content/regions/beach.json"] = beach;
    try { buildRegistry(files); throw new Error("expected a ContentError"); } catch (err) {
      expect(err).toBeInstanceOf(ContentError);
      const msg = (err as ContentError).problems.join("\n");
      expect(msg).toMatch(/explore\.view\[1\]\.when: unknown discovery "atlantis"/);
      expect(msg).toMatch(/landmark forest_edge\.visibleWhen: unknown item "unobtainium"/);
    }
  });
});

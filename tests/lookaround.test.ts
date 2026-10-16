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
    expect(ev.text).toMatch(/^Grey sand runs both ways/);
    expect(ev.text).toContain("Behind the dunes, a dark line of trees.");
    expect(ev.text).toContain("Something flashes in the shallows.");
    expect(ev.choices).toEqual([
      { id: "forest_edge", label: "the dunes", enabled: true, time: "30m" },
      { id: "rock_shelter", label: "the ring of rocks", enabled: true, time: "30m" },
      { id: "school_of_fish", label: "the shallows", enabled: true, time: "30m" },
      { id: "close", label: "close", enabled: true },
    ]);
    // closing without exploring: no time, nothing written
    const logged = e.state.log.length;
    choose(e, "close");
    expect(view(e).event).toBeNull();
    expect(e.state.time).toBe(t0);
    expect(e.state.log.length).toBe(logged);
  });

  it("exploring takes the landmark's time, shows what was found (also in the journal) and its results", () => {
    const e = startGame(reg, 2);
    open(e);
    const t0 = e.state.time;
    choose(e, "rock_shelter");
    expect(e.state.time - t0).toBe(30);
    const ev = view(e).event!;
    expect(ev.text).toMatch(/^At the far end of the beach, a ring of rocks breaks the sea wind/);
    expect(ev.choices).toEqual([{ id: "close", label: "close", enabled: true }]);
    expect(e.state.log.some((l) => l.text === ev.text)).toBe(true);
    choose(e, "close");
    expect(view(e).actions.map((a) => a.id)).toContain("light_fire"); // the result: a new action
  });

  it("an explored landmark is not offered again; new ones can appear later (the cliff past the rocks)", () => {
    const e = startGame(reg, 3);
    explore(e, "rock_shelter");
    open(e);
    expect(choices(e)).toEqual(["forest_edge", "cliff_shells", "school_of_fish", "close"]);
    expect(view(e).event!.text).toContain("At the far end, the ring of rocks, out of the wind.");
    expect(view(e).event!.text).toContain("Past the rocks, a low cliff drops into the surf.");
    choose(e, "close");
  });

  it("the * shows while something is left; when all is explored, look around stays and says what you see", () => {
    const e = startGame(reg, 4);
    const badge = () => view(e).actions.find((a) => a.id === "explore:beach")!.badge;
    expect(badge()).toBe("*");
    for (const id of ["forest_edge", "rock_shelter", "cliff_shells", "school_of_fish", "cliff_top"]) explore(e, id);
    expect(badge()).toBeUndefined();
    open(e);
    expect(choices(e)).toEqual(["close"]);
    expect(view(e).event!.text).toContain("Fish turn in the shallows.");
    expect(view(e).event!.text).toMatch(/There is nothing here you have not seen\.$/);
  });

  it("a landmark that appears later brings the * back", () => {
    const files = readContentFiles();
    const beach = structuredClone(files["content/regions/beach.json"]) as { explore: { landmarks: unknown[] } };
    beach.explore.landmarks.push({ id: "wreckage", label: "the wreckage", hours: 0.5, effort: "work", visibleWhen: { day: { gte: 2 } }, text: "Planks from the ship." });
    files["content/regions/beach.json"] = beach;
    const e = startGame(buildRegistry(files), 5);
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
    e.state.stats.thirst = 100;
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

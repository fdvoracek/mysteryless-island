import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/content/registry";
import { evaluate } from "../src/core/conditions";
import { view } from "../src/core/selectors";
import { readContentFiles, revealAll, startGame } from "./helpers";

describe("independent activities", () => {
  it("offers one definition in two linked areas, shares did/today counters, and refuses it elsewhere", () => {
    const files = readContentFiles();
    (files["content/regions/forest.json"] as { activities: string[] }).activities.push("collect_stones");
    const reg = buildRegistry(files);
    expect(reg.activities.get("collect_stones")!.regions).toEqual(["beach", "forest"]);
    const e = revealAll(startGame(reg, 7));
    for (const area of ["beach", "forest"]) {
      if (area !== e.state.location) expect(e.dispatch({ type: "travel", region: area }).ok).toBe(true);
      expect(view(e).actions.filter((a) => a.id === "collect_stones")).toHaveLength(1);
      expect(e.dispatch({ type: "activity", id: "collect_stones" }).ok).toBe(true);
    }
    expect(e.state.counters["did:collect_stones"]).toBe(2);
    expect(e.state.today.collect_stones).toBe(2);
    expect(evaluate({ did: "collect_stones", gte: 2 }, e.ctx())).toBe(true);
    expect(evaluate({ today: "collect_stones", gte: 2 }, e.ctx())).toBe(true);
    expect(e.dispatch({ type: "travel", region: "meadows" }).ok).toBe(true);
    expect(view(e).actions.some((a) => a.id === "collect_stones")).toBe(false);
    const before = structuredClone(e.state);
    expect(e.dispatch({ type: "activity", id: "collect_stones" })).toMatchObject({ ok: false, reason: "not here" });
    expect(e.state.items).toEqual(before.items);
    expect(e.state.time).toBe(before.time);
  });

  it("keeps linked globals in place once, appends them elsewhere, and allows unlinked globals", () => {
    const files = readContentFiles();
    const e = startGame(buildRegistry(files), 7);
    const beach = ["light_fire", "strike_fire", "make_fire", "stoke_fire", "collect_shells", "collect_stones", "catch_fish", "sleep"];
    const globals = ["light_fire", "strike_fire", "make_fire", "stoke_fire", "sleep"];
    expect(e.activities("beach").map((a) => a.id)).toEqual(beach);
    for (const area of ["forest", "meadows"]) {
      const links = (files[`content/regions/${area}.json`] as { activities: string[] }).activities;
      expect(e.activities(area).map((a) => a.id)).toEqual([...links, ...globals]);
    }
    (files["content/regions/beach.json"] as { activities: string[] }).activities = beach.filter((id) => id !== "sleep");
    const unlinked = startGame(buildRegistry(files), 7);
    expect(unlinked.reg.activities.get("sleep")!.regions).toEqual([]);
    for (const area of ["beach", "forest", "meadows"]) {
      expect(unlinked.activities(area).filter((a) => a.id === "sleep")).toHaveLength(1);
    }
  });

  it("rejects unknown links, orphan activities, and old embedded definitions", () => {
    const files = readContentFiles();
    const beach = files["content/regions/beach.json"] as { activities: unknown[] };
    beach.activities.push("unknown_activity");
    expect(() => buildRegistry(files)).toThrow(/content\/regions\/beach.json: activities\.8: unknown activity "unknown_activity"/);
    beach.activities.pop();
    beach.activities = beach.activities.filter((id) => id !== "collect_stones");
    expect(() => buildRegistry(files)).toThrow(/content\/activities\/collect_stones.json: activity "collect_stones" is neither linked nor global/);
    beach.activities.push(files["content/activities/collect_stones.json"]);
    expect(() => buildRegistry(files)).toThrow(/activities\.7: Expected string/);
  });

  it("indexes standalone memo keys and enforces explicit text IDs across all roots", () => {
    const files = readContentFiles();
    const reg = buildRegistry(files);
    expect(reg.textKeys.get(reg.activities.get("collect_stones")!.activity.log as object)).toBe("activities.collect_stones.log");
    (files["content/activities/collect_stones.json"] as { log: unknown }).log = { id: "shared_passage", variants: ["One.", "Two."] };
    const indexed = buildRegistry(files);
    expect(indexed.textKeys.get(indexed.activities.get("collect_stones")!.activity.log as object)).toBe("text:shared_passage");
    (files["content/regions/beach.json"] as { description: unknown }).description = { id: "shared_passage", variants: ["Three.", "Four."] };
    expect(() => buildRegistry(files)).toThrow(/duplicate text id "shared_passage"/);
    (files["content/regions/beach.json"] as { description: unknown }).description = "Beach.";
    (files["content/activities/collect_shells.json"] as { log: unknown }).log = { id: "shared_passage", variants: ["Three.", "Four."] };
    expect(() => buildRegistry(files)).toThrow(/duplicate text id "shared_passage"/);
  });
});

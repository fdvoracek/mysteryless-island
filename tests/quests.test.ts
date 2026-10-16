import { describe, expect, it } from "vitest";
import { buildRegistry, ContentError } from "../src/content/registry";
import { Engine } from "../src/core/engine";
import { view } from "../src/core/selectors";
import { loadRegistry, lookAround, readContentFiles, revealAll, startGame } from "./helpers";

const QUESTS = "content/quests/first-days.json";

/** Test-only quests (the shipped content has just "survive the first night"). */
const EXTRA = [
  { id: "find_water", title: "find water", trigger: "start", completeWhen: { did: "drink" }, doneLog: "Fresh water. You will last a while longer." },
  { id: "find_food", title: "find food", trigger: "start", completeWhen: { did: "eat" } },
  {
    id: "light_a_fire", title: "light a fire",
    trigger: { when: { all: [ { reached: { day: 1, hour: 16 } }, { not: { did: "light_fire" } } ] } },
    completeWhen: { timer: "fire" }, startLog: "The sun is low. It will be cold soon.",
  },
];
function registryWith(extra: unknown[], edit?: (files: Record<string, unknown>) => void) {
  const files = readContentFiles();
  files[QUESTS] = [...(structuredClone(files[QUESTS]) as unknown[]), ...extra];
  edit?.(files);
  return buildRegistry(files);
}

const shipped = loadRegistry();
const reg = registryWith(EXTRA);
/** fully explored, with a spear so fishing can be used to pass 2 hours */
const fresh = () => {
  const e = revealAll(startGame(reg, 3));
  e.applyEffects([{ give: { fishing_spear: 1 } }]);
  return e;
};
const active = (e: Engine) => view(e).quests.map((q) => q.id);

describe("quests", () => {
  it("the shipped game starts with one task: survive the first night", () => {
    const e = Engine.newGame(shipped, 3);
    expect(active(e)).toEqual(["survive_first_night"]);
  });

  it("start quests are active at once; condition quests wait for their trigger", () => {
    const e = revealAll(startGame(reg, 3));
    // the spear quest is triggered by finding the fish (revealAll found everything)
    expect(active(e)).toEqual(["survive_first_night", "build_fishing_spear", "find_water", "find_food"]);
    expect(e.state.quests.light_a_fire).toBeUndefined(); // not triggered yet
  });

  it("find water completes on the first drink and leaves the list", () => {
    const e = fresh();
    e.dispatch({ type: "travel", region: "forest" });
    expect(active(e)).toContain("find_water");
    e.dispatch({ type: "activity", id: "drink_stream" });
    expect(e.state.quests.find_water).toMatchObject({ status: "done" });
    expect(active(e)).not.toContain("find_water");
    expect(e.state.log.some((l) => l.text.includes("Fresh water. You will last"))).toBe(true);
  });

  it("find food completes when eating raw or cooked food (the eat tag)", () => {
    const e = fresh();
    e.applyEffects([{ give: { raw_fish: 1 } }]);
    e.dispatch({ type: "consume", item: "raw_fish" });
    expect(e.state.quests.find_food?.status).toBe("done");
    expect(e.state.counters).toMatchObject({ "did:eat": 1, "did:raw_fish": 1 });
  });

  it("survive the first night completes at day 2, 06:00, not before", () => {
    const e = fresh();
    e.applyEffects([{ give: { firewood: 20 } }]);
    e.advance(13.5, "rest"); // 19:30 on day 1
    e.dispatch({ type: "activity", id: "light_fire" }); // 20:00
    e.dispatch({ type: "activity", id: "stoke_fire" });
    e.dispatch({ type: "activity", id: "sleep" }); // wakes 04:15 on day 2
    expect(e.state.quests.survive_first_night.status).toBe("active");
    e.advance(2, "rest"); // past 06:00
    expect(e.dispatch({ type: "travel", region: "forest" }).ok).toBe(true); // any command re-checks quests
    expect(e.state.quests.survive_first_night.status).toBe("done");
  });

  it("light a fire appears in the afternoon if no fire was lit (time trigger) and completes when lit", () => {
    const e = fresh();
    e.applyEffects([{ give: { firewood: 3 } }]);
    e.advance(9.5, "rest"); // 15:30
    e.dispatch({ type: "activity", id: "catch_fish" }); // ends 17:30
    expect(active(e)).toContain("light_a_fire");
    expect(e.state.log.some((l) => l.text === "The sun is low. It will be cold soon.")).toBe(true);
    e.dispatch({ type: "activity", id: "light_fire" });
    expect(e.state.quests.light_a_fire.status).toBe("done");
  });

  it("light a fire never appears if a fire was lit earlier", () => {
    const e = fresh();
    e.applyEffects([{ give: { firewood: 3 } }]);
    e.dispatch({ type: "activity", id: "light_fire" });
    e.advance(12, "rest");
    e.dispatch({ type: "activity", id: "catch_fish" });
    expect(e.state.quests.light_a_fire).toBeUndefined();
  });

  it("supports manual quests started by an effect, and chains via { quest } conditions", () => {
    const r = registryWith(
      [
        ...EXTRA,
        { id: "q_manual", title: "manual", trigger: "manual", completeWhen: { item: "firewood", gte: 5 } },
        { id: "q_after_water", title: "after water", trigger: { when: { quest: "find_water", is: "done" } }, completeWhen: { did: "gather_wood" } },
      ],
      (files) => {
        const forest = structuredClone(files["content/regions/forest.json"]) as { activities: Array<{ effects?: unknown[] }> };
        forest.activities[0].effects = [{ startQuest: "q_manual" }];
        files["content/regions/forest.json"] = forest;
      },
    );
    const e = revealAll(startGame(r, 1));
    expect(active(e)).not.toContain("q_manual");

    e.dispatch({ type: "travel", region: "forest" });
    e.dispatch({ type: "activity", id: "drink_stream" }); // finishes find_water -> starts q_after_water
    expect(active(e)).toContain("q_after_water");
    e.dispatch({ type: "activity", id: "gather_wood" }); // starts q_manual, finishes q_after_water
    expect(e.state.quests.q_after_water.status).toBe("done");
    expect(e.state.quests.q_manual).toBeDefined();
  });

  it("the validator rejects broken quest content", () => {
    const files = readContentFiles();
    const bad = (extra: unknown, match: RegExp) => {
      const f = structuredClone(files);
      f[QUESTS] = [...(structuredClone(files[QUESTS]) as unknown[]), extra];
      expect(() => buildRegistry(f)).toThrow(ContentError);
      try { buildRegistry(f); } catch (err) { expect((err as ContentError).problems.join("\n")).toMatch(match); }
    };
    bad({ id: "q1", title: "x", trigger: "start", completeWhen: { did: "dance" } }, /unknown did "dance"/);
    bad({ id: "q2", title: "x", trigger: { when: { quest: "nope", is: "done" } }, completeWhen: { did: "drink" } }, /unknown quest "nope"/);
    bad({ id: "q3", title: "x", trigger: "manual", completeWhen: { did: "drink" } }, /can never start/);
  });
});

describe("quest actions: build a fishing spear", () => {
  const reg2 = loadRegistry();
  const explored = () => revealAll(startGame(reg2, 1));

  it("appears when the school of fish is found, with progress towards 10 firewood", () => {
    const e = startGame(reg2, 1);
    expect(view(e).quests.map((q) => q.id)).toEqual(["survive_first_night"]);
    for (let i = 0; i < 4; i++) lookAround(e);
    const q = view(e).quests.find((x) => x.id === "build_fishing_spear")!;
    expect(q.progress).toEqual([{ label: "firewood", have: 0, need: 10 }]);
    expect(q.action).toMatchObject({ label: "build", enabled: false, reason: "Needs 10 firewood (have 0)" });
  });

  it("building spends the wood, takes time, puts the spear in the inventory and finishes the quest", () => {
    const e = explored();
    e.applyEffects([{ give: { firewood: 12 } }]);
    expect(view(e).quests.find((x) => x.id === "build_fishing_spear")!.progress[0]).toMatchObject({ have: 10, need: 10 });
    const t0 = e.state.time;
    expect(e.dispatch({ type: "questAction", quest: "build_fishing_spear" }).ok).toBe(true);
    expect(e.state.time - t0).toBe(60);
    expect(e.state.items.firewood).toBe(2);
    expect(e.state.quests.build_fishing_spear.status).toBe("done");
    expect(view(e).inventory.map((i) => i.id)).toContain("fishing_spear");
    expect(view(e).quests.map((q) => q.id)).not.toContain("build_fishing_spear");
    expect(e.dispatch({ type: "activity", id: "catch_fish" }).ok).toBe(true);
  });

  it("refuses to build without enough wood, or once the quest is done", () => {
    const e = explored();
    e.applyEffects([{ give: { firewood: 9 } }]);
    expect(e.dispatch({ type: "questAction", quest: "build_fishing_spear" })).toMatchObject({ ok: false, reason: "needs 10 firewood (have 9)" });
    e.applyEffects([{ give: { firewood: 11 } }]);
    e.dispatch({ type: "questAction", quest: "build_fishing_spear" });
    expect(e.dispatch({ type: "questAction", quest: "build_fishing_spear" }).ok).toBe(false);
    expect(e.state.items.fishing_spear).toBe(1);
  });
});

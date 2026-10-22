import { afterAll, expect, it, vi } from "vitest";
import { buildRegistry, Condition, Effect, Id } from "../../src/content";
import { StudioStore } from "../../src/studio/store";
import { readDocuments } from "../../src/studio/documents";
import { continuation, deriveStory, referenceRole } from "../../src/studio/story";
import { flagUsedBy, referenceOptions } from "../../src/studio/references";
import { branches, unwrap } from "../../src/studio/schema";
import { temporaryPack } from "./pack";
import { z } from "zod";
const pack = temporaryPack();
afterAll(pack.cleanup);
function setup() { const store = new StudioStore(); store.disk = structuredClone(pack.files); return store; }
const signature = (store: StudioStore) => deriveStory(store.view.documents).edges.map(e => `${e.source} -> ${e.target}: ${e.label}`).sort();
it("has exactly the fixture story edges, including kinds, directions and labels", () => {
  // Each count is a distinct reference position, even when its endpoints match.
  const expected: [string, string, string, number][] = [
    ["discovery:bees", "quest:build_bee_hive", "trigger", 1],
    ["discovery:bees", "region:meadows", "when", 1],
    ["discovery:berry_bushes", "discovery:bees", "when", 1],
    ["discovery:berry_bushes", "region:meadows", "when", 4],
    ["discovery:cliff_shells", "discovery:cliff_top", "when", 1],
    ["discovery:cliff_shells", "quest:climb_cliff", "trigger", 1],
    ["discovery:cliff_shells", "region:beach", "when", 4],
    ["discovery:cliff_top", "quest:climb_cliff", "completes", 1],
    ["discovery:cliff_top", "region:beach", "when", 2],
    ["discovery:cliff_top", "region:meadows", "unlocks", 1],
    ["discovery:field_site", "quest:build_corn_field", "trigger", 1],
    ["discovery:field_site", "region:meadows", "when", 1],
    ["discovery:forest_edge", "region:beach", "when", 2],
    ["discovery:forest_edge", "region:forest", "unlocks", 1],
    ["discovery:rabbit_runs", "quest:build_snares", "trigger", 1],
    ["discovery:rabbit_runs", "region:forest", "when", 1],
    ["discovery:river", "quest:build_fish_trap", "trigger", 1],
    ["discovery:river", "quest:first_catch", "trigger", 1],
    ["discovery:river", "region:meadows", "when", 3],
    ["discovery:rock_shelter", "discovery:cliff_shells", "when", 1],
    ["discovery:rock_shelter", "region:beach", "when", 6],
    ["discovery:school_of_fish", "quest:build_fish_trap", "trigger", 1],
    ["discovery:school_of_fish", "quest:first_catch", "trigger", 1],
    ["discovery:school_of_fish", "region:beach", "when", 3],
    ["discovery:spring", "region:forest", "when", 4],
    ["discovery:wild_corn", "region:meadows", "when", 1],
    ["flag:auto_hunger_unavailable", "quest:build_drying_rack", "trigger", 1],
    ...["build_bee_hive", "build_corn_field", "build_drying_rack", "build_fish_weir", "build_rain_barrel", "build_shelter", "make_bed"].map(id => [`quest:${id}`, "quest:cut_logs", "trigger", 1] as [string, string, string, number]),
    ...["better_sleep", "build_rain_barrel", "build_shelter"].map(id => ["quest:survive_first_night", `quest:${id}`, "trigger", 1] as [string, string, string, number]),
    ["region:beach", "quest:build_rain_barrel", "trigger", 1],
    ["region:beach", "quest:build_shelter", "trigger", 1],
  ];
  expect(signature(setup())).toEqual(expected.flatMap(([source, target, label, count]) => Array(count).fill(`${source} -> ${target}: ${label}`)).sort());
});
it("adds exactly the matching edge for a new nested condition or effect, including flag bridges", () => {
  const store = setup(), before = signature(store);
  const event = store.view.documents.find(d => d.id === "shipwreck")!;
  const raw = event.raw as { scenes: Record<string, object> };
  store.edit(event.path, { ...raw, when: { all: [{ discovered: "rabbit_runs" }] } });
  expect(signature(store).filter(e => !before.includes(e))).toEqual(["discovery:rabbit_runs -> event:shipwreck: when"]);
  const beforeEffect = signature(store);
  store.edit(event.path, { ...store.view.documents.find(d => d.path === event.path)!.raw as object, scenes: { ...raw.scenes, start: { ...raw.scenes.start, effects: [{ startQuest: "climb_cliff" }] } } });
  expect(signature(store).filter(e => !beforeEffect.includes(e))).toEqual(["quest:climb_cliff -> event:shipwreck: effect: starts"]);
  expect(deriveStory(store.view.documents)).toBe(deriveStory(store.view.documents));
  expect(referenceRole({ file: event.path, path: "scenes.start.effects.0.roll.0.when.flag", kind: "flag", id: "x" })).toEqual({ label: "when", effect: false });
});
it("derives flags from shared metadata, offers pickers/Used by and warns only for unset reads", () => {
  const store = setup(), event = store.view.documents.find(d => d.id === "shipwreck")!;
  const raw = event.raw as { scenes: Record<string, object> };
  store.edit(event.path, { ...raw, when: { all: [{ flag: "authored_flag" }, { flag: "typo_flag" }, { flag: "auto_hunger_unavailable" }] }, scenes: { ...raw.scenes, start: { ...raw.scenes.start, effects: [{ flag: "authored_flag" }, { unflag: "cleared_flag" }] } } });
  const docs = store.view.documents, graph = deriveStory(docs);
  expect(graph.edges).toEqual(expect.arrayContaining([
    expect.objectContaining({ source: "event:shipwreck", target: "flag:authored_flag", label: "effect: sets flag" }),
    expect.objectContaining({ source: "flag:authored_flag", target: "event:shipwreck", label: "when" }),
    expect.objectContaining({ source: "event:shipwreck", target: "flag:cleared_flag", label: "effect: clears flag" }),
  ]));
  expect(graph.warnings.map(w => w.message).filter(m => /typo_flag/.test(m))).toHaveLength(1);
  expect(graph.warnings.some(w => /authored_flag|auto_hunger_unavailable/.test(w.message))).toBe(false);
  expect(graph.nodes.find(n => n.id === "flag:auto_hunger_unavailable")?.note).toBe("set by the game");
  expect(referenceOptions("flag", docs, event)).toContain("authored_flag");
  expect(flagUsedBy(docs, "authored_flag")).toHaveLength(2);
});
it("creates and saves all six continuation drafts with the exact linking condition", async () => {
  for (const node of [{ kind: "discovery", id: "discovery:rabbit_runs", label: "rabbit_runs" }, { kind: "quest", id: "quest:climb_cliff", label: "climb_cliff" }]) for (const kind of ["quests", "events", "regions"]) {
    const store = setup(); let disk = structuredClone(pack.files);
    Object.defineProperty(store, "transport", { value: async (_url: string, init?: RequestInit) => {
      if (!init?.method) return Response.json({ files: disk });
      const path = _url.slice("/__studio/files/".length), body = JSON.parse(String(init.body));
      disk = [...disk, { path, content: body.content, hash: "saved", encoding: "utf8" }];
      return Response.json({ hash: "saved" });
    } });
    const prefill = continuation(node, kind);
    const required = kind === "quests" ? { title: "a new task", completeWhen: { discovered: "spring" }, doneLog: "You finish the task." } : kind === "events" ? { title: "A new event", scenes: { start: { text: "A scene.", journal: "A scene opens." } } } : { name: "a new area", title: "A new area", description: "You find a place.", climate: { baseC: 15 }, travelHours: 1, activities: [] };
    const path = store.create(kind, { id: `continued_${kind}`, ...required, ...prefill });
    expect(store.drafts.has(path)).toBe(true); expect(disk.some(f => f.path === path)).toBe(false);
    expect(store.view.diagnostics).toEqual([]);
    expect(await store.save()).toEqual({ written: [path], notWritten: [] });
    expect(readDocuments(disk).diagnostics).toEqual([]);
    expect(JSON.parse(disk.find(f => f.path === path)!.content)).toMatchObject(prefill);
  }
});
it("flag descriptions are metadata only: both packs retain identical registry validation", () => {
  const shipped = temporaryPack(new URL("../../content", import.meta.url));
  try {
    const fields = [Condition, Effect].flatMap(schema => branches(schema).flatMap(branch => {
      const node = unwrap(branch); return node instanceof z.ZodObject ? Object.entries(node.shape).filter(([key]) => ["flag", "unflag"].includes(key)).map(([, value]) => value as z.ZodTypeAny) : [];
    }));
    expect(fields).toHaveLength(3);
    for (const field of fields) {
      expect(field.description).toBe("ref:flag");
      const { description: _description, ...definition } = field._def;
      expect(definition).toEqual(Id._def);
      for (const value of ["valid_flag", "Bad ID", "", 123, null]) expect(field.safeParse(value)).toEqual(Id.safeParse(value));
    }
    for (const files of [pack.files, shipped.files]) {
      const parsed = Object.fromEntries(files.map(f => [f.path, JSON.parse(f.content)]));
      const withMetadata = buildRegistry(parsed);
      // Lazy Condition/Effect schemas construct their branches during parsing.
      // Suppress only the new description at its source for the baseline parse.
      const original = Id.describe.bind(Id);
      const spy = vi.spyOn(Id, "describe").mockImplementation(description => description === "ref:flag" ? Id : original(description));
      try {
        expect(buildRegistry(parsed)).toEqual(withMetadata);
        expect(spy.mock.calls.some(([description]) => description === "ref:flag")).toBe(true);
      } finally { spy.mockRestore(); }
    }
  } finally { shipped.cleanup(); }
});

it("reuses document revisions without losing cached syntax diagnostics or same-hash edits", () => {
  const files = structuredClone(pack.files), first = readDocuments(files, false);
  expect(readDocuments(structuredClone(files), false).documents).toBe(first.documents);
  files[0].content = "{broken";
  const broken = readDocuments(files, false);
  expect(broken.diagnostics).toHaveLength(1);
  expect(readDocuments(files, false).diagnostics).toEqual(broken.diagnostics);
  expect(readDocuments(files).diagnostics).toEqual(expect.arrayContaining(broken.diagnostics));
  expect(broken.documents).not.toBe(first.documents);
});

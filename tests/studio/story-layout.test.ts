import { afterAll, describe, expect, it } from "vitest";
import { StudioStore } from "../../src/studio/store";
import { deriveStory, filterEdges, filterStory } from "../../src/studio/story";
import { arrange, neighbourhood, NODE_HEIGHT, NODE_WIDTH, searchNodes } from "../../src/studio/story-layout";
import { LAYOUT_PATH, nodeKey, parseLayout, prunePins, renamePin, serializeLayout } from "../../src/studio/layout-file";
import { PREFS_KEY, readPrefs, writePrefs } from "../../src/studio/story-prefs";
import { identities } from "../../src/studio/references";
import { readDocuments } from "../../src/studio/documents";
import { temporaryPack } from "./pack";
const pack = temporaryPack();
afterAll(pack.cleanup);
const story = () => { const store = new StudioStore(); store.disk = structuredClone(pack.files); return { store, story: deriveStory(store.view.documents) }; };
const rect = (p: { x: number; y: number }) => ({ ...p, width: NODE_WIDTH, height: NODE_HEIGHT });
const touches = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("edge filter", () => {
  it("classifies from the reference position label: story-driving edges only by default", () => {
    const { story: s } = story();
    const driving = new Set(s.edges.filter(e => e.driving).map(e => e.label));
    expect([...driving].sort()).toEqual(["completes", "trigger", "unlocks"]);
    expect(s.edges.filter(e => !e.driving).every(e => e.label === "when")).toBe(true);
    expect(filterEdges(s, false).edges).toHaveLength(s.edges.filter(e => e.driving).length);
    expect(filterEdges(s, true)).toBe(s);
    expect(filterEdges(s, false).nodes).toBe(s.nodes);
  });
  it("treats effects that start, unlock or set flags and flag reads as driving; clearing and text conditions are not", () => {
    const { store } = story(), event = store.view.documents.find(d => d.id === "shipwreck")!;
    const raw = event.raw as { scenes: Record<string, object> };
    store.edit(event.path, { ...raw, when: { all: [{ flag: "authored_flag" }] }, scenes: { ...raw.scenes, start: { ...raw.scenes.start, effects: [{ flag: "authored_flag" }, { unflag: "cleared_flag" }, { startQuest: "climb_cliff" }, { unlock: "forest" }] } } });
    const edges = deriveStory(store.view.documents).edges, byLabel = (label: string) => edges.filter(e => e.target === "event:shipwreck" || e.source === "event:shipwreck").filter(e => e.label === label);
    for (const label of ["effect: sets flag", "effect: starts", "effect: unlocks", "when"]) expect(byLabel(label).length, label).toBeGreaterThan(0);
    expect(byLabel("effect: sets flag").every(e => e.driving)).toBe(true);
    expect(byLabel("effect: starts").every(e => e.driving)).toBe(true);
    expect(byLabel("effect: unlocks").every(e => e.driving)).toBe(true);
    // A flag read is a story edge; the same position on a region condition is only a reference.
    expect(edges.find(e => e.source === "flag:authored_flag" && e.target === "event:shipwreck")?.driving).toBe(true);
    expect(edges.find(e => e.label === "effect: clears flag")?.driving).toBe(false);
    expect(byLabel("when").filter(e => !e.source.startsWith("flag:")).every(e => e.driving === false)).toBe(true);
  });
  it("leaves area membership independent of the filter", () => {
    const { story: s } = story();
    expect(filterStory(filterEdges(s, false), "forest", ["discovery", "quest", "event", "region", "flag"]).nodes.map(n => n.id))
      .toEqual(filterStory(s, "forest", ["discovery", "quest", "event", "region", "flag"]).nodes.map(n => n.id));
  });
});

describe("focus and search", () => {
  it("follows edges in both directions to the chosen depth", () => {
    const { story: s } = story(), graph = filterEdges(s, false);
    expect([...neighbourhood(graph, "discovery:cliff_shells", 1)].sort()).toEqual(["discovery:cliff_shells", "quest:climb_cliff"]);
    expect([...neighbourhood(graph, "discovery:cliff_shells", 2)].sort()).toEqual(["discovery:cliff_shells", "discovery:cliff_top", "quest:climb_cliff"]);
    expect([...neighbourhood(graph, "discovery:cliff_shells", 0)]).toEqual(["discovery:cliff_shells"]);
    // incoming and outgoing: cliff_top feeds climb_cliff and unlocks meadows
    expect([...neighbourhood(graph, "discovery:cliff_top", 1)].sort()).toEqual(["discovery:cliff_top", "quest:climb_cliff", "region:meadows"]);
    expect([...neighbourhood(graph, "quest:climb_cliff", 1)].sort()).toEqual(["discovery:cliff_shells", "discovery:cliff_top", "quest:climb_cliff"]);
  });
  it("finds nodes by name or ID, exact IDs first", () => {
    const { story: s } = story();
    expect(searchNodes(s.nodes, "rabbit_runs")[0].id).toBe("discovery:rabbit_runs");
    expect(searchNodes(s.nodes, "  CLIFF_TOP ")[0].id).toBe("discovery:cliff_top");
    expect(searchNodes(s.nodes, "cliff").map(n => n.id)).toEqual(expect.arrayContaining(["discovery:cliff_top", "discovery:cliff_shells", "quest:climb_cliff"]));
    expect(searchNodes(s.nodes, "")).toEqual([]);
    expect(searchNodes(s.nodes, "zzzzzz")).toEqual([]);
  });
});

describe("arrangement", () => {
  const options = { direction: "LR", spacing: "normal", group: false } as const;
  it("is deterministic and follows the direction option", () => {
    const graph = filterEdges(story().story, false);
    const lr = arrange(graph, options, {}), again = arrange(graph, options, {}), tb = arrange(graph, { ...options, direction: "TB" }, {});
    expect([...lr.positions]).toEqual([...again.positions]);
    const edge = graph.edges.find(e => e.label === "trigger")!;
    expect(lr.positions.get(edge.source)!.x).toBeLessThan(lr.positions.get(edge.target)!.x);
    expect(tb.positions.get(edge.source)!.y).toBeLessThan(tb.positions.get(edge.target)!.y);
  });
  it("spacing changes the extent", () => {
    const graph = filterEdges(story().story, false);
    const width = (spacing: "compact" | "wide") => { const xs = [...arrange(graph, { ...options, spacing }, {}).positions.values()].map(p => p.x); return Math.max(...xs) - Math.min(...xs); };
    expect(width("wide")).toBeGreaterThan(width("compact"));
  });
  it("keeps pinned nodes where they are and places the others clear of them", () => {
    const graph = filterEdges(story().story, false), base = arrange(graph, options, {});
    const [a, b, c] = ["quest:climb_cliff", "discovery:cliff_top", "region:forest"];
    // Pin a node exactly on another node's automatic spot to force a collision.
    const pins = { [a]: { ...base.positions.get(b)! }, [c]: { x: -900, y: 40 } };
    const placed = arrange(graph, options, pins);
    expect(placed.positions.get(a)).toEqual(pins[a]);
    expect(placed.positions.get(c)).toEqual(pins[c]);
    const rects = graph.nodes.map(n => ({ id: n.id, ...rect(placed.positions.get(n.id)!) }));
    for (const [i, one] of rects.entries()) for (const two of rects.slice(i + 1)) if (one.id !== a || two.id !== a) expect(touches(one, two), `${one.id} / ${two.id}`).toBe(false);
    expect([...arrange(graph, options, pins).positions]).toEqual([...placed.positions]);
  });
  it("groups nodes into area boxes that contain their members", () => {
    const graph = filterEdges(story().story, false), grouped = arrange(graph, { ...options, group: true }, {}, id => `area ${id}`);
    expect(grouped.groups.map(g => g.id)).toEqual(expect.arrayContaining(["group:beach", "group:forest", "group:meadows"]));
    expect(grouped.groups.find(g => g.id === "group:forest")!.label).toBe("area forest");
    for (const group of grouped.groups) {
      const area = group.id.slice("group:".length);
      const members = graph.nodes.filter(n => [...(n.areas ?? [])].sort()[0] === area);
      expect(members.length).toBeGreaterThan(0);
      for (const n of members) {
        const p = grouped.positions.get(n.id)!;
        expect(p.x).toBeGreaterThanOrEqual(group.x); expect(p.y).toBeGreaterThanOrEqual(group.y);
        expect(p.x + NODE_WIDTH).toBeLessThanOrEqual(group.x + group.width); expect(p.y + NODE_HEIGHT).toBeLessThanOrEqual(group.y + group.height);
      }
    }
    expect(arrange(graph, options, {}).groups).toEqual([]);
    const rects = graph.nodes.map(n => rect(grouped.positions.get(n.id)!));
    for (const [i, one] of rects.entries()) for (const two of rects.slice(i + 1)) expect(touches(one, two)).toBe(false);
  });
});

describe("layout file", () => {
  it("round-trips with sorted keys, whole numbers and one pin per line", () => {
    const text = serializeLayout({ "quest:b": { x: 1.4, y: 2.6 }, "discovery:a": { x: -5, y: 0 } });
    expect(text).toBe('{\n  "version": 1,\n  "pins": {\n    "discovery:a": { "x": -5, "y": 0 },\n    "quest:b": { "x": 1, "y": 3 }\n  }\n}\n');
    expect(parseLayout(text).pins).toEqual({ "discovery:a": { x: -5, y: 0 }, "quest:b": { x: 1, y: 3 } });
    expect(serializeLayout({})).toBe('{\n  "version": 1,\n  "pins": {}\n}\n');
  });
  it.each(["", "{broken", "[]", "null", '{"version":2,"pins":{}}', '{"version":1}', '{"version":1,"pins":[]}'])("reads %j as no pins, with a reason, and never throws", text => {
    const parsed = parseLayout(text);
    expect(parsed.pins).toEqual({}); expect(parsed.problem).toBeTruthy();
  });
  it("drops invalid keys and coordinates but keeps the valid pins", () => {
    expect(parseLayout(JSON.stringify({ version: 1, pins: { "quest:ok": { x: 1, y: 2 }, "bad key": { x: 1, y: 2 }, "quest:nan": { x: "1", y: 2 }, "item:x": { x: 1, y: 1 }, "quest:null": null } })).pins).toEqual({ "quest:ok": { x: 1, y: 2 } });
    expect(parseLayout(undefined)).toEqual({ pins: {} });
  });
  it("prunes missing nodes, renames keys and lets a pin made under the new key win", () => {
    const pins = { "quest:a": { x: 1, y: 1 }, "quest:b": { x: 2, y: 2 } };
    expect(prunePins(pins, new Set(["quest:a"]))).toEqual({ "quest:a": { x: 1, y: 1 } });
    expect(prunePins(pins, new Set(["quest:a", "quest:b", "quest:c"]))).toBe(pins);
    expect(renamePin(pins, "quest:a", "quest:z")).toEqual({ "quest:z": { x: 1, y: 1 }, "quest:b": { x: 2, y: 2 } });
    expect(renamePin(pins, "quest:a", "quest:b")["quest:b"]).toEqual({ x: 2, y: 2 });
    expect(renamePin(pins, "quest:none", "quest:z")).toBe(pins);
  });
  it("names the story node of every renamable story identity, and nothing else", () => {
    const { store } = story(), documents = store.view.documents, ids = identities(documents);
    const keys = new Set(deriveStory(documents).nodes.map(n => n.id));
    const mapped = ids.map(id => ({ id, key: nodeKey(id) })).filter(x => x.key);
    for (const { key } of mapped) expect(keys.has(key!), key).toBe(true);
    for (const kind of ["quest", "region", "discovery", "event"]) expect(mapped.some(x => x.key!.startsWith(`${kind}:`)), kind).toBe(true);
    expect(nodeKey(ids.find(id => id.kind === "item")!)).toBeUndefined();
    expect(nodeKey(ids.find(id => id.kind === "quest")!, "renamed")).toMatch(/^quest:renamed$/);
    expect(LAYOUT_PATH).toBe("studio-layout/story.json");
    expect(readDocuments([{ path: LAYOUT_PATH, content: "{ not json", encoding: "utf8", hash: "h" }]).documents).toEqual([]);
  });
});

describe("remembered story view", () => {
  const memory = (initial?: string) => { const data = new Map<string, string>(initial === undefined ? [] : [[PREFS_KEY, initial]]); return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } }; };
  it("round-trips options and viewport and falls back to defaults on anything unreadable", () => {
    const storage = memory();
    const prefs = { options: { direction: "TB", spacing: "wide", group: true, allReferences: true, depth: 2 }, viewport: { x: 5, y: -6, zoom: 0.5 } } as const;
    writePrefs(prefs, storage);
    expect(readPrefs(storage)).toEqual(prefs);
    for (const bad of ["{", "null", "[]", '{"options":{"direction":"up","spacing":3,"depth":9},"viewport":{"x":"1"}}']) {
      expect(readPrefs(memory(bad))).toEqual({ options: { direction: "LR", spacing: "normal", group: false, allReferences: false, depth: 1 }, viewport: undefined });
    }
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readPrefs(throwing).options.direction).toBe("LR");
    expect(() => writePrefs(prefs, throwing)).not.toThrow();
    expect(readPrefs(undefined).options.depth).toBe(1);
  });
});

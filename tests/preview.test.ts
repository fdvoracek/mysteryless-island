import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Engine } from "../src/core/engine";
import { installDebug } from "../src/debug/console";
import { clearSave, hasSavedGame, loadGame, previewSeed, readSave, readSaveStatus, saveGame, writeSave } from "../src/persistence/save";
import { loadRegistry, startGame } from "./helpers";

const reg = loadRegistry();
const g = globalThis as unknown as { localStorage?: unknown; location?: unknown; window?: unknown };

/** a localStorage that records every key it is asked about */
function trackedStorage() {
  const data = new Map<string, string>();
  const touched = new Set<string>();
  return {
    data, touched,
    getItem: (k: string) => { touched.add(k); return data.get(k) ?? null; },
    setItem: (k: string, v: string) => { touched.add(k); data.set(k, v); },
    removeItem: (k: string) => { touched.add(k); data.delete(k); },
  };
}
const visit = (search: string) => { g.location = { search }; };
function useSaves(state = startGame(reg, 3).state) {
  writeSave(state); saveGame(state); readSaveStatus(reg); readSave(reg); loadGame(reg); hasSavedGame(); clearSave();
}

let storage: ReturnType<typeof trackedStorage>;
beforeEach(() => { storage = trackedStorage(); g.localStorage = storage; });
afterEach(() => { delete g.location; delete g.window; });

describe("preview save isolation", () => {
  it("preview mode touches only the preview keys", () => {
    visit("?preview&variants=first");
    useSaves();
    expect([...storage.touched].sort()).toEqual(["textisland.preview.save", "textisland.preview.saved"]);
  });

  it("normal mode touches only the player's keys", () => {
    for (const search of ["", "?variants=first", "?seed=5"]) {
      visit(search);
      useSaves();
    }
    expect([...storage.touched].sort()).toEqual(["textisland.save", "textisland.saved"]);
  });

  it("keeps the two sets of slots apart", () => {
    visit("");
    const normal = startGame(reg, 1);
    writeSave(normal.state); saveGame(normal.state);
    visit("?preview");
    expect(readSave(reg)).toBeNull();
    expect(hasSavedGame()).toBe(false);
    const preview = startGame(reg, 2);
    writeSave(preview.state);
    clearSave();
    visit("");
    expect(readSave(reg)?.seed).toBe(1);
    expect(hasSavedGame()).toBe(true);
    expect(loadGame(reg)).not.toBeNull();
  });
});

describe("preview seed", () => {
  it("is read only in preview mode and only as whole digits", () => {
    expect(previewSeed("?preview&seed=1234")).toBe(1234);
    expect(previewSeed("?preview&seed=0")).toBe(0);
    expect(previewSeed("?seed=1234")).toBeUndefined();
    for (const bad of ["", "-1", "1.5", "12ab", "0x10", "1e3", " 7", "99999999999999999999"]) {
      expect(previewSeed(`?preview&seed=${encodeURIComponent(bad)}`)).toBeUndefined();
    }
    expect(previewSeed("?preview")).toBeUndefined();
  });

  it("the same seed gives the same new game", () => {
    const seed = previewSeed("?preview&seed=1234")!;
    const a = Engine.newGame(reg, seed), b = Engine.newGame(reg, seed), c = Engine.newGame(reg, seed + 1);
    expect(a.state).toEqual(b.state);
    expect(a.state).not.toEqual(c.state);
  });
});

describe("ti.unlock", () => {
  it("opens a place through the unlock effect, whatever its rule", () => {
    const e = startGame(reg, 1);
    const locked = [...reg.regions.keys()].find((id) => !e.state.regions[id].unlocked)!;
    expect(locked).toBeDefined();
    let renders = 0;
    g.window = {};
    installDebug(() => e, () => { renders++; }, () => {});
    const ti = (g.window as { ti: { unlock(id: string): void } }).ti;
    ti.unlock(locked);
    expect(e.state.regions[locked].unlocked).toBe(true);
    expect(renders).toBe(1);
  });
});

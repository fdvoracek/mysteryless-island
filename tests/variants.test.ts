import { restoreState } from "../src/persistence/migrate";
import { beforeEach, describe, expect, it } from "vitest";
import { Engine } from "../src/core/engine";
import { seedRng } from "../src/core/rng";
import type { GameState } from "../src/core/state";
import { chooseText, setVariantMode } from "../src/core/text";
import { loadRegistry, readContentFiles, startGame, lookAround } from "./helpers";

const reg = loadRegistry();
const look = lookAround;

describe("text variants", () => {
  beforeEach(() => setVariantMode("random"));

  it("never shows the same variant twice in a row, and shows all of them", () => {
    const s = { rng: seedRng(1), lastText: {} as Record<string, number> };
    const list = ["A.", "B.", "C."];
    const seen: string[] = [];
    for (let i = 0; i < 300; i++) seen.push(chooseText(list, s));
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
    expect(new Set(seen)).toEqual(new Set(list));
  });

  it("a single text is always itself, and {place} is filled in", () => {
    const s = { rng: seedRng(2), lastText: {} };
    expect(chooseText("Only one.", s)).toBe("Only one.");
    expect(chooseText(["You walk to {place}.", "You set off for {place}."], s, { place: "the forest" })).toMatch(/the forest\.$/);
  });

  it("in the game, fishing again and again does not repeat the same line twice in a row", () => {
    const e = startGame(reg, 3);
    for (let i = 0; i < 4; i++) look(e);
    e.applyEffects([{ give: { fishing_spear: 1 } }]);
    e.state.quests.first_catch.status = "done"; // so every catch below is one paragraph (no task ending)
    const wade: string[] = [];
    for (let i = 0; i < 12; i++) {
      e.state.stats = { health: 100, energy: 100, hunger: 0, thirst: 0 }; // stay alive and keep fishing
      e.state.time = 8 * 60; // daylight
      e.dispatch({ type: "activity", id: "catch_fish" });
      const lines = e.state.log.filter((l) => l.turn === e.state.turn).map((l) => l.text).reverse();
      wade.push(lines[0]);
    }
    for (let i = 1; i < wade.length; i++) expect(wade[i]).not.toBe(wade[i - 1]);
    expect(new Set(wade).size).toBe(3); // all three ways of wading in were used
  });

  it("the same seed and commands give the same wording (saves replay identically)", () => {
    const play = () => {
      const e = startGame(reg, 7);
      for (let i = 0; i < 4; i++) look(e);
      e.dispatch({ type: "travel", region: "forest" });
      return e.state.log.map((l) => l.text);
    };
    expect(play()).toEqual(play());
  });

  it("the opening varies between games", () => {
    const intros = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) intros.add(startGame(reg, seed).state.log[0].text);
    expect(intros.size).toBe(3);
  });

  it("loads saves made before variants were remembered", () => {
    const old = structuredClone(startGame(reg, 5).state) as Partial<GameState>;
    delete old.lastText;
    const e = new Engine(reg, restoreState(old, reg)!);
    look(e);
    look(e);
    expect(e.state.lastText).toBeDefined();
  });
});

describe("text variants in the content", () => {
  it("the first variant mode shows the original wording", () => {
    setVariantMode("first");
    const e = startGame(reg, 1);
    expect(e.state.log[0].text).toMatch(/^Awake\. Salt in the mouth\./);
  });

  it("uses {placeholders} only where the engine fills them (journal lines, the end screen)", () => {
    const bad: string[] = [];
    const walk = (o: unknown, path: string) => {
      if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${path}[${i}]`));
      else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (!k.startsWith("_")) walk(v, `${path}.${k}`); }
      else if (typeof o === "string" && /\{\w+\}/.test(o)) {
        // which fields the engine fills, and with what
        const allowed: Array<[RegExp, string[]]> = [
          [/\.journal\.(walkTo|wayOpens)/, ["{place}"]],
          [/\.ending\.survived/, ["{time}", "{day}"]],
          [/\.ending\.cause/, ["{cause}"]],
          [/\.sleep\.newDay/, ["{day}"]],
          [/\.sleep\.recovery\.[a-z_]+\.text/, ["{place}", "{energy}"]],
          [/\.sleep\.collapse\.text/, ["{place}"]],
          [/\.tasks\.title/, ["{task}"]],
          [/\.tasks\.gained/, ["{item}", "{where}"]],
          [/\.tasks\.used/, ["{item}"]],
          [/\.tasks\.opened/, ["{place}"]],
          [/\.tasks\.possible/, ["{action}"]],
          [/\.tasks\.built/, ["{building}"]],
          [/\.newPlace\.(text|go)/, ["{place}"]],
          [/\.cycle\.words\.ready/, ["{n}"]],
        ];
        const rule = allowed.find(([re]) => re.test(path));
        const ok = !!rule && o.match(/\{\w+\}/g)!.every((m) => rule[1].includes(m));
        if (!ok) bad.push(`${path}: "${o}"`);
      }
    };
    for (const [file, data] of Object.entries(readContentFiles())) walk(data, file);
    expect(bad).toEqual([]);
  });
});

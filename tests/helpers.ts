import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRegistry } from "../src/content/registry";
import type { Registry } from "../src/content/registry";
import { Engine } from "../src/core/engine";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Read every JSON file under content/ the same way the Vite loader does. */
export function readContentFiles(dir = join(ROOT, "content")): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) Object.assign(out, readContentFiles(p));
    else if (name.endsWith(".json")) out[relative(ROOT, p).split("\\").join("/")] = JSON.parse(readFileSync(p, "utf8"));
  }
  return out;
}

export const loadRegistry = () => buildRegistry(readContentFiles());

/**
 * A new game past the opening event (the shipwreck): `choice` is what you grabbed, "knife" by
 * default, which gives the old start kit (knife and summer clothes). Adds a box of matches unless
 * `matches: false`, so "light fire" is the quick, sure kind; fire by friction has its own tests.
 */
export function startGame(reg: Registry, seed: number, choice = "knife", opts: { matches?: boolean; keepNotes?: boolean } = {}): Engine {
  const e = Engine.newGame(reg, seed);
  e.dispatch({ type: "choose", choice });
  e.dispatch({ type: "choose", choice: "close" });
  if (opts.matches !== false && !e.state.items.matches) e.applyEffects([{ give: { matches: 10 } }]);
  if (!opts.keepNotes) closeNotes(e);
  return e;
}

/**
 * A finished task opens a note that blocks the game until closed (like an event). Most tests
 * play on: close notes after every command. Tests about notes pass { keepNotes: true }.
 */
function closeNotes(e: Engine) {
  const dispatch = e.dispatch.bind(e);
  e.dispatch = (cmd) => {
    const r = dispatch(cmd);
    while (e.state.events.active?.kind === "note") dispatch({ type: "choose", choice: "close" });
    return r;
  };
}

/**
 * Test shortcut: make every discovery and unlock every region at once, without passing time.
 * For tests about later mechanics; exploration itself is tested in exploration.test.ts.
 */
export function revealAll(e: Engine): Engine {
  for (const [id, r] of e.reg.regions) {
    const st = e.state.regions[id];
    st.unlocked = true;
    st.discoveries = (r.explore?.landmarks ?? []).map((d) => d.id);
    st.explored = st.discoveries.length;
  }
  e.syncQuests(); // quests triggered by discoveries (e.g. the fishing spear)
  e.state.events.notes = []; // tasks done by the discoveries themselves (climb the cliff): no notes waiting
  return e;
}

/**
 * "look around" and explore the next landmark offered (in content order), then close the finding:
 * what one "look around" did before exploration became a pop-up. Returns the result of exploring
 * (or of closing the pop-up when nothing is left).
 */
export function lookAround(e: Engine) {
  const opened = e.dispatch({ type: "explore" });
  if (!opened.ok) return opened;
  const region = e.reg.regions.get(e.state.location)!;
  // the next landmark that can be explored now (the cliff top waits for a rope)
  const next = e.openLandmarks(region).find((d) => e.checkChoice(d).enabled);
  if (!next) return e.dispatch({ type: "choose", choice: "close" });
  const res = e.dispatch({ type: "choose", choice: next.id });
  if (e.state.events.active?.kind === "exploration") e.dispatch({ type: "choose", choice: "close" });
  return res;
}


/** Make something from the craft menu: open it, pick the recipe (the pop-up closes, the work takes its time). */
export function craft(e: Engine, recipe: string) {
  const opened = e.dispatch({ type: "menu", menu: "craft" });
  if (!opened.ok) return opened;
  const res = e.dispatch({ type: "choose", choice: recipe });
  if (!res.ok && e.state.events.active?.kind === "menu") e.dispatch({ type: "choose", choice: "close" });
  return res;
}

/** Build something here from the build menu. */
export function build(e: Engine, building: string) {
  const opened = e.dispatch({ type: "menu", menu: "build" });
  if (!opened.ok) return opened;
  const res = e.dispatch({ type: "choose", choice: building });
  if (!res.ok && e.state.events.active?.kind === "menu") e.dispatch({ type: "choose", choice: "close" });
  return res;
}

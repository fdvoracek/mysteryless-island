import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRegistry } from "../src/content/registry";
import type { Engine } from "../src/core/engine";

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
 * Test shortcut: make every discovery and unlock every region at once, without passing time.
 * For tests about later mechanics; exploration itself is tested in exploration.test.ts.
 */
export function revealAll(e: Engine): Engine {
  for (const [id, r] of e.reg.regions) {
    const st = e.state.regions[id];
    st.unlocked = true;
    st.discoveries = (r.explore?.discoveries ?? []).map((d) => d.id);
    st.explored = Math.max(0, ...(r.explore?.discoveries ?? []).map((d) => d.at));
  }
  e.checkpoint = JSON.parse(JSON.stringify(e.state));
  return e;
}

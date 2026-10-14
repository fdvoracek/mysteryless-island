import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRegistry } from "../src/content/registry";

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

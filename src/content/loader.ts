import { buildRegistry, type Registry } from "./registry";

/**
 * Loads every JSON file under /content at build time (Vite bundles them).
 * Adding a new file in content/regions or content/items needs no code change.
 */
const files = import.meta.glob("../../content/**/*.json", { eager: true, import: "default" });

export function loadContent(): Registry {
  // normalise "../../content/x.json" -> "content/x.json"
  const normalised: Record<string, unknown> = {};
  for (const [path, data] of Object.entries(files)) {
    normalised[path.replace(/^(\.\.\/)+/, "")] = data;
  }
  return buildRegistry(normalised);
}

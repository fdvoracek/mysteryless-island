import { buildRegistry, type Registry } from "./registry";

/** Vite replaces the mode at build time; browser tests use frozen content. */
const shippedFiles = import.meta.glob("../../content/**/*.json", { eager: true, import: "default" });
const testFiles = import.meta.glob("../../tests/fixtures/content/**/*.json", { eager: true, import: "default" });
const files = import.meta.env.MODE === "engine-test" ? testFiles : shippedFiles;

export function loadContent(): Registry {
  // Both roots use the same content/x.json keys expected by the registry.
  const normalised: Record<string, unknown> = {};
  for (const [path, data] of Object.entries(files)) {
    normalised[path.slice(path.lastIndexOf("/content/") + 1)] = data;
  }
  return buildRegistry(normalised);
}

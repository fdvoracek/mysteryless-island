import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { FileDocument } from "../../src/studio/documents";
/** All Studio content access is through a disposable copy, never a writable fixture. */
export function temporaryPack(source = new URL("../fixtures/content", import.meta.url)) {
  const STUDIO_ROOT = mkdtempSync(join(tmpdir(), "studio-pr08-"));
  cpSync(source, join(STUDIO_ROOT, "content"), { recursive: true });
  const files: FileDocument[] = [];
  function walk(dir: string) {
    for (const name of readdirSync(dir)) { const path = join(dir, name); if (statSync(path).isDirectory()) walk(path); else if (name.endsWith(".json")) files.push({ path: relative(STUDIO_ROOT, path), content: readFileSync(path, "utf8"), hash: name, encoding: "utf8" }); }
  }
  walk(join(STUDIO_ROOT, "content"));
  return { STUDIO_ROOT, files, cleanup: () => rmSync(STUDIO_ROOT, { recursive: true, force: true }) };
}

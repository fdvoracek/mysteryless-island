import { expect, it } from "vitest";
import { build } from "vite";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const exec = promisify(execFile);
it("builds the real production game without Studio/React and rejects a contaminated dist", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "textisland-build-"));
  try {
    const result = await build({ logLevel: "silent", build: { outDir, emptyOutDir: true } });
    if (!Array.isArray(result) && "output" in result) {
      const modules = result.output.flatMap((chunk) => chunk.type === "chunk" ? Object.keys(chunk.modules) : []);
      expect(modules.length).toBeGreaterThan(0);
      expect(modules.filter((id) => /src\/studio|node_modules\/(react|react-dom|@xyflow|@dagrejs|@codemirror|@lezer)\//.test(id))).toEqual([]);
      // The game never reads the Studio's layout file: it is neither bundled nor referenced.
      expect(modules.filter((id) => id.includes("studio-layout"))).toEqual([]);
      expect(result.output.filter((o) => (o.type === "chunk" ? o.code : String(o.source)).includes("studio-layout"))).toEqual([]);
    } else throw new Error("Expected a production bundle");
    await exec(process.execPath, ["tools/check-game-dist.mjs", outDir]);
    await mkdir(join(outDir, "studio"));
    await expect(exec(process.execPath, ["tools/check-game-dist.mjs", outDir])).rejects.toThrow();
    await rm(join(outDir, "studio"), { recursive: true });
    await writeFile(join(outDir, "contaminated.js"), 'const c = "@codemirror/view";');
    await expect(exec(process.execPath, ["tools/check-game-dist.mjs", outDir])).rejects.toThrow();
    await writeFile(join(outDir, "contaminated.js"), 'fetch("/__studio/files");');
    await expect(exec(process.execPath, ["tools/check-game-dist.mjs", outDir])).rejects.toThrow();
  } finally { await rm(outDir, { recursive: true, force: true }); }
}, 30_000);

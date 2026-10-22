import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

export async function checkGameDist(root = "dist") {
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "studio") throw new Error(`Studio directory in game build: ${file}`);
        await walk(file);
      } else if (/\.(html|js|css|map)$/.test(entry.name)) {
        const source = await readFile(file, "utf8");
        if (/studio-root|studio-shell|studio:files-changed|__studio\/files|src\/studio|react-dom|react\.transitional\.element|react\.element|@xyflow\/react|@dagrejs\/dagre/.test(source)) throw new Error(`Studio/React code in game build: ${file}`);
      }
    }
  }
  await walk(root);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await checkGameDist(process.argv[2]);
  console.log("Game dist contains no Studio or React code.");
}

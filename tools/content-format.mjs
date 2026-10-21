import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
// Use the existing TypeScript loader without adding a separate script runtime.
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, ws: false }, appType: "custom" });
try {
  const { formatContent } = await server.ssrLoadModule("/src/content/format.ts");
  async function formatDirectory(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) await formatDirectory(path);
      else if (entry.name.endsWith(".json")) {
        const source = await readFile(path, "utf8");
        const formatted = formatContent(JSON.parse(source));
        if (source !== formatted) await writeFile(path, formatted);
      }
    }
  }
  for (const path of ["../content/", "../tests/fixtures/content/"]) {
    await formatDirectory(new URL(path, import.meta.url));
  }
} finally {
  await server.close();
}

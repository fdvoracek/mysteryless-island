import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contentApi } from "../../tools/vite-content-api";

let server: ViteDevServer | undefined;
let isolated: string | undefined;
afterEach(async () => {
  await server?.close(); server = undefined;
  vi.unstubAllEnvs();
  if (isolated) await rm(isolated, { recursive: true, force: true });
  isolated = undefined;
});

async function start() {
  server = await createServer({ configFile: false, root: process.cwd(), mode: "studio", appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true, entries: [] }, plugins: [contentApi()], server: { port: 0, hmr: false, watch: { ignored: ["**"] } } });
  await server.listen();
  return (server.httpServer!.address() as { port: number }).port;
}
const get = async (port: number, path: string) => (await fetch(`http://127.0.0.1:${port}${path}`)).status;

describe("the game's content root in the Studio dev server", () => {
  it("reads the checkout's content/ without STUDIO_ROOT", async () => {
    const port = await start();
    const loader = (await server!.transformRequest("/src/content/loader.ts"))!.code;
    expect(loader).toContain('"/content/game.json?import"');
    expect(loader).not.toContain("@studio-root");
    expect(await get(port, "/content/game.json")).toBe(200);
  });

  it("reads STUDIO_ROOT/content as a whole and keeps the checkout's content/ denied", async () => {
    isolated = await realpath(await mkdtemp(join(tmpdir(), "textisland-game-root-")));
    await mkdir(join(isolated, "content/items"), { recursive: true });
    await writeFile(join(isolated, "content/game.json"), "{}\n");
    await writeFile(join(isolated, "content/items/only_here.json"), '{ "id": "only_here" }\n');
    await writeFile(join(isolated, "secret.json"), "{}\n");
    vi.stubEnv("STUDIO_ROOT", isolated);
    const port = await start();
    const loader = (await server!.transformRequest("/src/content/loader.ts"))!.code;
    expect(loader).toContain(`/@fs${isolated}/content/items/only_here.json`);
    expect(loader).not.toContain('"/content/activities/');
    expect(await get(port, `/@fs${isolated}/content/items/only_here.json`)).toBe(200);
    expect(await get(port, `/@fs${isolated}/secret.json`)).toBe(403);
    expect(await get(port, "/content/game.json")).toBe(403);
  });
});

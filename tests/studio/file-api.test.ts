import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { realpathSync } from "node:fs";
import { request } from "node:http";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contentApi, isContentFullReload } from "../../tools/vite-content-api";

let root: string;
let server: ViteDevServer;
let port: number;
const prefix = "/__studio/files";
function call(method: string, path = prefix, body?: unknown, headers: Record<string, string | undefined> = {}) {
  return new Promise<{ status: number; data: any }>((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request({ hostname: "127.0.0.1", port, method, path, headers: { "Content-Type": "application/json", ...(payload === undefined ? {} : { "Content-Length": Buffer.byteLength(payload) }), ...headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode!, data: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch (error) { reject(error); }
      });
    });
    req.on("error", reject);
    req.end(payload);
  });
}
async function inventory() { return (await call("GET")).data.files as { path: string; content: string; encoding: string; hash: string }[]; }
async function item() { return (await inventory()).find((file) => file.path === "content/items/test_item.json")!; }
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "textisland-api-"));
  await mkdir(join(root, "content/items"), { recursive: true });
  await mkdir(join(root, "public/illustrations"), { recursive: true });
  await writeFile(join(root, "content/items/test_item.json"), '{ "id": "test_item", "_note": "preserve me" }\n');
  await writeFile(join(root, "public/illustrations/test.png"), Buffer.from([0, 255, 1, 2]));
  await writeFile(join(root, "package.json"), '{ "private": true }');
  server = await createServer({ root, configFile: false, appType: "custom", logLevel: "silent", plugins: [contentApi()], server: { port: 0, hmr: false, watch: { ignored: ["**"] } } });
  await server.listen();
  port = (server.httpServer!.address() as { port: number }).port;
});
afterEach(async () => { await server?.close(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });

describe("localhost content file transport", () => {
  it("isolates reads/writes in STUDIO_ROOT with the same allowlist and symlink checks", async () => {
    await server.close();
    const isolated = join(root, "isolated");
    await mkdir(join(isolated, "content/items"), { recursive: true });
    await mkdir(join(isolated, "public/illustrations"), { recursive: true });
    await writeFile(join(isolated, "content/items/test_item.json"), '{"id":"test_item","name":"isolated fixture"}');
    vi.stubEnv("STUDIO_ROOT", isolated);
    server = await createServer({ root, configFile: false, appType: "custom", logLevel: "silent", plugins: [contentApi()], server: { port: 0, hmr: false } });
    await server.listen(); port = (server.httpServer!.address() as { port: number }).port;
    const file = await item();
    expect(JSON.parse(file.content).name).toBe("isolated fixture");
    expect((await call("PUT", `${prefix}/${file.path}`, { expectedHash: file.hash, content: '{"id":"test_item","name":"changed fixture"}', encoding: "utf8" })).status).toBe(200);
    expect(await readFile(join(root, "content/items/test_item.json"), "utf8")).toContain("preserve me");
    expect((await call("PUT", `${prefix}/../package.json`, { expectedHash: null, content: "bad", encoding: "utf8" })).status).toBe(403);
    await symlink(join(root, "package.json"), join(isolated, "content/items/escape.json"));
    expect((await call("GET")).status).toBe(403);
  });

  it("notifies the Studio of allowed external file changes only", () => {
    const send = vi.spyOn(server.ws, "send");
    const real = realpathSync(root); // the plugin watches real paths (macOS temp directories are symlinked)
    server.watcher.emit("all", "change", join(real, "content/items/test_item.json"));
    expect(send).toHaveBeenCalledWith({ type: "custom", event: "studio:files-changed", data: { path: "content/items/test_item.json" } });
    send.mockClear();
    server.watcher.emit("all", "change", join(real, "package.json"));
    expect(send).not.toHaveBeenCalled();
    send.mockRestore();
  });
  it("drops only the full reload Vite sends for content and image files", () => {
    const real = realpathSync(root);
    const reload = (path: string) => ({ type: "full-reload", triggeredBy: join(real, path) });
    expect(isContentFullReload(reload("content/items/new.json"), real)).toBe(true);
    expect(isContentFullReload(reload("public/illustrations/a.png"), real)).toBe(true);
    expect(isContentFullReload(reload("src/main.ts"), real)).toBe(false);
    expect(isContentFullReload(reload("package.json"), real)).toBe(false);
    expect(isContentFullReload({ type: "full-reload" }, real)).toBe(false);
    expect(isContentFullReload({ type: "custom", event: "studio:files-changed", triggeredBy: join(real, "content/a.json") }, real)).toBe(false);
  });
  it("prints the exact Studio URL with the actual listening port", () => {
    const log = vi.spyOn(server.config.logger, "info");
    server.printUrls();
    expect(log).toHaveBeenCalledWith(`  Studio: http://127.0.0.1:${port}/studio/`);
    log.mockRestore();
  });

  it.each(["localhost", "127.0.0.1"])("accepts %s Host with its matching Origin or no Origin", async (hostname) => {
    const host = `${hostname}:${port}`;
    for (const headers of [{ Host: host }, { Host: host, Origin: `http://${host}` }]) {
      expect((await call("GET", prefix, undefined, headers)).status).toBe(200);
      // A guarded mutation reaches input validation, rather than being rejected by the Host check.
      expect((await call("PUT", `${prefix}/content/items/test_item.json`, {}, headers)).status).toBe(400);
    }
  });

  it("rejects both local Host/Origin mismatches and ignores forwarded headers", async () => {
    for (const [host, origin] of [
      [`localhost:${port}`, `http://127.0.0.1:${port}`],
      [`127.0.0.1:${port}`, `http://localhost:${port}`],
      [`evil.example:${port}`, `http://localhost:${port}`],
      [`localhost:${port}`, "https://evil.example"],
    ]) {
      const headers = { Host: host, Origin: origin, "X-Forwarded-Host": `localhost:${port}`, "X-Forwarded-Proto": "http" };
      expect((await call("GET", prefix, undefined, headers)).status).toBe(403);
      expect((await call("PUT", `${prefix}/content/items/test_item.json`, {}, headers)).status).toBe(403);
    }
  });

  it("lists raw JSON/comments and lossless binary images with stable hashes", async () => {
    const response = await call("GET", prefix, undefined, { Origin: `http://127.0.0.1:${port}` });
    expect(response.status).toBe(200);
    const files = response.data.files;
    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({ path: "content/items/test_item.json", content: '{ "id": "test_item", "_note": "preserve me" }\n', encoding: "utf8", hash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(Buffer.from(files[1].content, "base64")).toEqual(Buffer.from([0, 255, 1, 2]));
    expect(await inventory()).toEqual(files);
  });

  it.each([
    { Origin: "https://evil.example" }, { Origin: "null" }, { Host: "evil.example:5173" },
    { Host: "localhost:1" }, { Origin: "http://127.0.0.1:1" }, { Host: "evil.example", "X-Forwarded-Host": "127.0.0.1" },
  ])("rejects foreign Host/Origin %j for reads and writes", async (headers) => {
    expect((await call("GET", prefix, undefined, headers)).status).toBe(403);
    expect((await call("PUT", `${prefix}/content/items/test_item.json`, {}, headers)).status).toBe(403);
  });

  it.each([
    "../package.json", "content/../package.json", "content/%2e%2e/package.json", "content/%252e%252e/package.json",
    "/tmp/file.json", "content//file.json", "content/%5c..%5cfile.json", ".git/config", ".githooks/hook.json",
    "package.json", ".env.local", "content/file.ts", "public/illustrations/code.js", "public/illustrations/../file.png", "content/%00.json",
  ])("rejects traversal/non-allowlisted path %s", async (path) => {
    expect((await call("PUT", `${prefix}/${path}`, { expectedHash: null, content: "bad", encoding: "utf8" })).status).toBe(403);
    expect(await readFile(join(root, "package.json"), "utf8")).toBe('{ "private": true }');
  });

  it("writes atomically, detects stale hashes, and serializes concurrent updates", async () => {
    const original = await item();
    const update = { expectedHash: original.hash, content: '{ "id": "test_item", "name": "updated" }\n', encoding: "utf8" };
    const results = await Promise.all([call("PUT", `${prefix}/${original.path}`, update), call("PUT", `${prefix}/${original.path}`, update)]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect((await item()).content).toBe(update.content);
    expect((await call("DELETE", `${prefix}/${original.path}`, { expectedHash: original.hash })).status).toBe(409);
    expect(await readdir(join(root, "content/items"))).toEqual(["test_item.json"]);
    const now = await item();
    expect((await call("DELETE", `${prefix}/${original.path}`, { expectedHash: now.hash })).data.changed).toEqual([original.path]);
    expect((await inventory()).some((file) => file.path === original.path)).toBe(false);
  });

  it("requires null hash for creation and rejects malformed input and image encodings", async () => {
    const path = `${prefix}/content/items/new_item.json`;
    expect((await call("PUT", path, { content: "{}", encoding: "utf8" })).status).toBe(400);
    expect((await call("PUT", path, { expectedHash: "stale", content: "{}", encoding: "utf8" })).status).toBe(409);
    expect((await call("PUT", path, { expectedHash: null, content: "{}", encoding: "base64" })).status).toBe(400);
    expect((await call("PUT", path, { expectedHash: null, content: "{}", encoding: "utf8" })).status).toBe(200);
    expect((await call("PUT", path, { expectedHash: null, content: "{}", encoding: "utf8" })).status).toBe(409);
    expect((await call("PUT", `${prefix}/public/illustrations/new.png`, { expectedHash: null, content: "!!!", encoding: "base64" })).status).toBe(400);
    const binary = { expectedHash: null, content: "AP8=", encoding: "base64" };
    expect((await call("PUT", `${prefix}/public/illustrations/new.png`, binary)).status).toBe(200);
    expect(await readFile(join(root, "public/illustrations/new.png"))).toEqual(Buffer.from([0, 255]));
    expect((await call("PUT", path, [], { "Content-Type": "text/plain" })).status).toBe(415);
    expect((await call("PUT", path, [])).status).toBe(400);
  });

  it("renames without overwriting, reports changed paths, and rejects stale/unsafe destinations", async () => {
    const original = await item();
    const route = `${prefix}/${original.path}/rename`;
    expect((await call("POST", route, { expectedHash: "stale", path: "content/items/new.json" })).status).toBe(409);
    expect((await call("POST", route, { expectedHash: original.hash, path: "../package.json" })).status).toBe(403);
    expect((await call("POST", route, { expectedHash: original.hash, path: original.path })).status).toBe(409);
    const result = await call("POST", route, { expectedHash: original.hash, path: "content/items/new.json" });
    expect(result).toMatchObject({ status: 200, data: { changed: [original.path, "content/items/new.json"], hash: original.hash } });
    expect((await inventory()).some((file) => file.path === original.path)).toBe(false);
  });

  it("rejects symlinked files, parents and roots without reading/writing outside the allowlist", async () => {
    await symlink(join(root, "package.json"), join(root, "content/items/linked.json"));
    expect((await call("GET")).status).toBe(403);
    expect((await call("PUT", `${prefix}/content/items/linked.json`, { expectedHash: null, content: "bad", encoding: "utf8" })).status).toBe(403);
    await rm(join(root, "content/items/linked.json"));
    await symlink(root, join(root, "content/escape"));
    expect((await call("DELETE", `${prefix}/content/escape/package.json`, { expectedHash: null })).status).toBe(403);
    await rm(join(root, "public/illustrations"), { recursive: true });
    await symlink(root, join(root, "public/illustrations"));
    expect((await call("GET")).status).toBe(403);
  });
});

describe("studio-layout allowlist (one directory, JSON only)", () => {
  const layout = `${prefix}/studio-layout/story.json`;
  it("creates, lists, updates and deletes studio-layout/*.json with expected hashes", async () => {
    expect((await call("PUT", layout, { expectedHash: "stale", content: "{}", encoding: "utf8" })).status).toBe(409);
    expect((await call("PUT", layout, { expectedHash: null, content: "{}", encoding: "base64" })).status).toBe(400);
    const created = await call("PUT", layout, { expectedHash: null, content: '{"version":1}\n', encoding: "utf8" });
    expect(created).toMatchObject({ status: 200, data: { changed: ["studio-layout/story.json"] } });
    expect(await readFile(join(root, "studio-layout/story.json"), "utf8")).toBe('{"version":1}\n');
    expect((await call("PUT", layout, { expectedHash: null, content: "{}", encoding: "utf8" })).status).toBe(409);
    const file = (await inventory()).find((f) => f.path === "studio-layout/story.json")!;
    expect(file).toMatchObject({ content: '{"version":1}\n', encoding: "utf8", hash: created.data.hash });
    expect((await call("PUT", layout, { expectedHash: file.hash, content: '{"version":2}\n', encoding: "utf8" })).status).toBe(200);
    expect((await call("DELETE", layout, { expectedHash: file.hash })).status).toBe(409);
    const now = (await inventory()).find((f) => f.path === "studio-layout/story.json")!;
    expect((await call("DELETE", layout, { expectedHash: now.hash })).status).toBe(200);
  });
  it.each([
    "studio-layout/story.png", "studio-layout/story.txt", "studio-layout/nested/story.json", "studio-layout/.hidden.json",
    "studio-layout/../package.json", "studio-layout/%2e%2e/package.json", "studio-layout/%5cstory.json", "studio-layout//story.json",
    "studio-layoutx/story.json", "studio-layout.json", "studio/story.json", "Studio-Layout/story.json",
  ])("rejects %s", async (path) => {
    expect((await call("PUT", `${prefix}/${path}`, { expectedHash: null, content: "{}", encoding: "utf8" })).status).toBe(403);
    // Nothing was created for a rejected path, whatever its spelling.
    expect((await readdir(root)).filter((name) => /studio/i.test(name))).toEqual([]);
    expect(await readFile(join(root, "package.json"), "utf8")).toBe('{ "private": true }');
  });
  it("applies Host/Origin rules and keeps cross-root renames out", async () => {
    expect((await call("PUT", layout, { expectedHash: null, content: "{}", encoding: "utf8" }, { Origin: "https://evil.example" })).status).toBe(403);
    expect((await call("PUT", layout, { expectedHash: null, content: "{}", encoding: "utf8" }, { Host: `localhost:${port}`, Origin: `http://127.0.0.1:${port}` })).status).toBe(403);
    await call("PUT", layout, { expectedHash: null, content: "{}", encoding: "utf8" });
    const file = (await inventory()).find((f) => f.path === "studio-layout/story.json")!;
    expect((await call("POST", `${layout}/rename`, { expectedHash: file.hash, path: "content/items/story.json" })).status).toBe(400);
    expect((await call("POST", `${layout}/rename`, { expectedHash: file.hash, path: "package.json" })).status).toBe(403);
  });
  it("rejects a symlinked directory or file", async () => {
    await mkdir(join(root, "studio-layout"));
    await symlink(join(root, "package.json"), join(root, "studio-layout/linked.json"));
    expect((await call("GET")).status).toBe(403);
    expect((await call("PUT", `${prefix}/studio-layout/linked.json`, { expectedHash: null, content: "bad", encoding: "utf8" })).status).toBe(403);
    await rm(join(root, "studio-layout"), { recursive: true });
    await symlink(root, join(root, "studio-layout"));
    expect((await call("GET")).status).toBe(403);
    expect((await call("PUT", layout, { expectedHash: null, content: "bad", encoding: "utf8" })).status).toBe(403);
    expect(await readFile(join(root, "package.json"), "utf8")).toBe('{ "private": true }');
  });
  it("does not tell the game to reload for layout files", () => {
    const send = vi.spyOn(server.ws, "send");
    server.watcher.emit("all", "change", join(realpathSync(root), "studio-layout/story.json"));
    expect(send).not.toHaveBeenCalled();
    send.mockRestore();
  });
});

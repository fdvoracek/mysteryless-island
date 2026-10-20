import { expect, test, type Page } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import type { Artwork } from "../src/content/schema";
import type { IllustrationOptions } from "../src/ui/illustration";

declare global {
  interface Window {
    IllustrationFixture: { updateIllustration(slot: HTMLElement, artwork: Artwork | undefined, options?: IllustrationOptions): void };
    originalImage?: HTMLImageElement;
    staleImage?: HTMLImageElement;
  }
}

// Bundle the actual helper through Vite's public API. This global exists only in
// an ephemeral browser fixture, never in the production app or content registry.
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let helperBundle: string;
test.beforeAll(async () => {
  const temporary = mkdtempSync(join(tmpdir(), "textisland-illustration-browser-"));
  try {
    const entry = join(temporary, "entry.js");
    writeFileSync(entry, `export { updateIllustration } from ${JSON.stringify(resolve(projectRoot, "src/ui/illustration.ts"))};`);
    const result = await build({
      configFile: false, root: projectRoot, base: "/nested/pages/", logLevel: "silent",
      build: { write: false, emptyOutDir: false, outDir: temporary, minify: false,
        lib: { entry, name: "IllustrationFixture", formats: ["iife"] } },
    });
    const output = Array.isArray(result) ? result[0] : result;
    if (!("output" in output)) throw new Error("Expected an in-memory Vite bundle");
    const chunk = output.output.find((file) => file.type === "chunk");
    if (!chunk || chunk.type !== "chunk") throw new Error("Missing illustration helper bundle");
    helperBundle = chunk.code;
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

const scene = (src = "illustrations/shore.svg"): Artwork => ({
  id: "browser_scene", src, width: 120, height: 40, alt: "Quiet shore",
});
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><path d="M0 30H120" stroke="black"/></svg>';
async function update(page: Page, artwork: Artwork | undefined, options?: IllustrationOptions) {
  await page.evaluate(({ artwork, options }) => {
    window.IllustrationFixture.updateIllustration(document.querySelector<HTMLElement>("#slot")!, artwork, options);
  }, { artwork, options });
}

test.beforeEach(async ({ page }) => {
  await page.route("**/nested/pages/harness.html", (route) => route.fulfill({ contentType: "text/html", body:
    '<!doctype html><html><body><section><span id="label">coastal journal</span><div id="slot" hidden></div></section></body></html>' }));
  await page.goto("/nested/pages/harness.html");
  await page.addScriptTag({ content: helperBundle });
});

test("shared illustration helper loads nested Pages paths and preserves its image across updates", async ({ page }) => {
  let requests = 0;
  await page.route("**/nested/pages/illustrations/shore.svg", async (route) => {
    requests++; await route.fulfill({ contentType: "image/svg+xml", body: svg });
  });
  await update(page, scene(), { eager: true });
  const slot = page.locator("#slot"), image = slot.locator("img");
  await expect(slot).toHaveAttribute("data-image-state", "ready");
  await expect(image).toHaveAttribute("src", "/nested/pages/illustrations/shore.svg");
  await expect(image).toHaveAttribute("alt", "Quiet shore");
  expect(await image.evaluate((el: HTMLImageElement) => ({ width: el.width, height: el.height,
    naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight }))).toEqual({ width: 120, height: 40, naturalWidth: 120, naturalHeight: 40 });
  await image.evaluate((el) => { window.originalImage = el as HTMLImageElement; });
  await update(page, { ...scene(), alt: "Shore at low tide" }, { eager: true });
  expect(await image.evaluate((el) => el === window.originalImage)).toBe(true);
  await expect(image).toHaveAttribute("alt", "Shore at low tide");
  expect(requests).toBe(1);
  await update(page, scene(), { decorative: true });
  await expect(image).toHaveAttribute("alt", "");
  await expect(slot).toHaveAttribute("aria-hidden", "true");
});

test("source changes ignore stale image callbacks without hiding the current artwork", async ({ page }) => {
  await page.route("**/nested/pages/illustrations/shore.svg", (route) => route.fulfill({ contentType: "image/svg+xml", body: svg }));
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/nested/pages/illustrations/forest.svg", async (route) => {
    await held; await route.fulfill({ contentType: "image/svg+xml", body: svg });
  });
  try {
    await update(page, scene(), { eager: true });
    await expect(page.locator("#slot")).toHaveAttribute("data-image-state", "ready");
    await page.locator("#slot img").evaluate((el) => { window.staleImage = el as HTMLImageElement; });
    await update(page, scene("illustrations/forest.svg"), { eager: true });
    expect(await page.locator("#slot img").evaluate((el) => el === window.staleImage)).toBe(false);
    await page.evaluate(() => {
      const image = window.staleImage!;
      image.onerror?.call(image, new Event("error"));
      image.onload?.call(image, new Event("load"));
    });
    await expect(page.locator("#slot")).toHaveAttribute("data-image-state", "loading");
    release();
    await expect(page.locator("#slot")).toHaveAttribute("data-image-state", "ready");
    await page.evaluate(() => { const image = window.staleImage!; image.onerror?.call(image, new Event("error")); });
    await expect(page.locator("#slot")).toBeVisible();
    await expect(page.locator("#slot")).toHaveAttribute("data-image-state", "ready");
    await expect(page.locator("#label")).toHaveText("coastal journal");
  } finally { release(); }
});

test("404 artwork hides only its slot and is not automatically retried by later renders", async ({ page }) => {
  let requests = 0;
  await page.route("**/nested/pages/illustrations/missing.svg", async (route) => {
    requests++; await route.fulfill({ status: 404, body: "not found" });
  });
  const missing = scene("illustrations/missing.svg");
  await update(page, missing, { eager: true });
  await expect(page.locator("#slot")).toHaveAttribute("data-image-state", "missing");
  await expect(page.locator("#slot")).toBeHidden();
  await expect(page.locator("#label")).toBeVisible();
  for (let render = 0; render < 3; render++) await update(page, missing, { eager: true });
  expect(requests).toBe(1);
  await expect(page.locator("#slot img")).toHaveCount(0);
  await expect(page.locator("#label")).toHaveText("coastal journal");
});

test("returning to a cached failure ignores callbacks from the abandoned pending source", async ({ page }) => {
  await page.route("**/nested/pages/illustrations/missing.svg", (route) => route.fulfill({ status: 404, body: "not found" }));
  const missing = scene("illustrations/missing.svg");
  await update(page, missing, { eager: true });
  await expect(page.locator("#slot")).toHaveAttribute("data-image-state", "missing");
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/nested/pages/illustrations/pending.svg", async (route) => {
    await held; await route.fulfill({ contentType: "image/svg+xml", body: svg });
  });
  try {
    await update(page, scene("illustrations/pending.svg"), { eager: true });
    await page.locator("#slot img").evaluate((el) => { window.staleImage = el as HTMLImageElement; });
    await update(page, missing, { eager: true });
    await page.evaluate(() => {
      const image = window.staleImage!;
      image.onload?.call(image, new Event("load"));
      image.onerror?.call(image, new Event("error"));
    });
    await expect(page.locator("#slot")).toHaveAttribute("data-image-state", "missing");
    await expect(page.locator("#slot")).toBeHidden();
    await expect(page.locator("#slot")).toBeEmpty();
    await expect(page.locator("#label")).toBeVisible();
  } finally { release(); }
});

test("optional artwork remains empty and hides when metadata is removed", async ({ page }) => {
  await update(page, undefined);
  await expect(page.locator("#slot")).toBeHidden();
  await expect(page.locator("#slot")).toBeEmpty();
  await page.route("**/nested/pages/illustrations/shore.svg", (route) => route.fulfill({ contentType: "image/svg+xml", body: svg }));
  await update(page, scene(), { eager: true });
  await expect(page.locator("#slot")).toHaveAttribute("data-image-state", "ready");
  await page.locator("#slot img").evaluate((el) => { window.staleImage = el as HTMLImageElement; });
  await update(page, undefined);
  await page.evaluate(() => { const image = window.staleImage!; image.onload?.call(image, new Event("load")); });
  await expect(page.locator("#slot")).toBeHidden();
  await expect(page.locator("#slot")).toBeEmpty();
  await expect(page.locator("#label")).toBeVisible();
});

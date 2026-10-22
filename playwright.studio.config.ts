import { defineConfig, devices } from "@playwright/test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Playwright also evaluates config in workers; they inherit this run's root, never make a second one.
let fixtureRoot = process.env.TEXTISLAND_STUDIO_TEST_ROOT;
if (!fixtureRoot) {
  fixtureRoot = mkdtempSync(join(tmpdir(), "textisland-studio-fixtures-"));
  cpSync(fileURLToPath(new URL("./tests/fixtures/content", import.meta.url)), join(fixtureRoot, "content"), { recursive: true });
  mkdirSync(join(fixtureRoot, "public/illustrations"), { recursive: true });
  mkdirSync(join(fixtureRoot, "studio-layout"), { recursive: true });
  const game = JSON.parse(readFileSync(join(fixtureRoot, "content/game.json"), "utf8"));
  game._studio_fixture_root = fixtureRoot;
  writeFileSync(join(fixtureRoot, "content/game.json"), JSON.stringify(game) + "\n");
  process.env.TEXTISLAND_STUDIO_TEST_ROOT = fixtureRoot;
}

export default defineConfig({
  testDir: "tests/studio-browser",
  globalTeardown: "./tests/studio-browser/cleanup.ts",
  metadata: { studioFixtureRoot: fixtureRoot },
  workers: 1,
  timeout: 30_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://127.0.0.1:5175", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "studio-chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run studio -- --port 5175",
    env: { STUDIO_ROOT: fixtureRoot },
    url: "http://127.0.0.1:5175/studio/",
    // Always test this checkout and keep writes out of the owner's running server.
    reuseExistingServer: false,
    timeout: 30_000,
  },
});

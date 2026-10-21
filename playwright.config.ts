import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke test against a separate build of the frozen test-content fixture.
 * `npm run test:e2e` builds dist-test first; the production build remains in dist/.
 */
export default defineConfig({
  testDir: "e2e",
  // Every case owns a fresh browser context; lengthy UI flows can run side by side.
  fullyParallel: true,
  workers: 2,
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx vite preview --mode engine-test --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});

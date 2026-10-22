import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/studio-browser",
  workers: 1,
  timeout: 30_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://127.0.0.1:5175", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "studio-chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run studio -- --port 5175",
    url: "http://127.0.0.1:5175/studio/",
    // Always test this checkout and keep writes out of the owner's running server.
    reuseExistingServer: false,
    timeout: 30_000,
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  base: "./",
  build: {
    outDir: mode === "engine-test" ? "dist-test" : "dist",
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Engine tests use a frozen registry; tests/variants.test.ts checks its variety.
    setupFiles: ["tests/setup.ts"],
  },
}));

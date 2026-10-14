import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // tests read the first wording of each text; tests/variants.test.ts checks the variety
    setupFiles: ["tests/setup.ts"],
  },
});

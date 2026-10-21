import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  base: "./",
  build: {
    outDir: mode === "engine-test" ? "dist-test" : "dist",
  },
  test: {
    environment: "node",
    // Bound worker startup/memory overhead on large developer machines.
    maxWorkers: 4,
    minWorkers: 1,
    include: ["tests/**/*.test.ts"],
    // Engine tests use a frozen registry; tests/variants.test.ts checks its variety.
    setupFiles: ["tests/setup.ts"],
  },
}));

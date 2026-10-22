import { defineConfig } from "vitest/config";
import { contentApi } from "./tools/vite-content-api";

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: mode === "studio" ? [contentApi()] : [],
  esbuild: { jsx: "automatic" },
  server: mode === "studio" ? { host: "127.0.0.1", port: 5173, strictPort: true } : undefined,
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

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": new URL("./tests/server-only.ts", import.meta.url)
        .pathname,
    },
  },
  test: {
    fileParallelism: false,
    include: ["tests/integration/**/*.test.ts"],
    passWithNoTests: false,
    testTimeout: 15_000,
  },
});

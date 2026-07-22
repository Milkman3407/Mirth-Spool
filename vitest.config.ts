import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      enabled: false,
    },
    include: ["apps/web/src/**/*.test.ts", "packages/**/*.test.ts"],
    passWithNoTests: false,
  },
});

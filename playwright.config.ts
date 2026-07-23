import { defineConfig } from "@playwright/test";

const crossBrowserProjects =
  process.env.MIRTHSPOOL_CROSS_BROWSER === "1"
    ? [
        {
          name: "firefox-pwa",
          testMatch: /pwa-cross-browser\.spec\.ts/,
          use: { browserName: "firefox" as const },
        },
        {
          name: "webkit-pwa",
          testMatch: /pwa-cross-browser\.spec\.ts/,
          use: { browserName: "webkit" as const },
        },
      ]
    : [];

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: "line",
  retries: 0,
  testDir: "./tests/e2e",
  timeout:
    process.env.MIRTHSPOOL_E2E_RELEASE_IMAGES === "true" ? 60_000 : 30_000,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    ...crossBrowserProjects,
  ],
  use: {
    baseURL: "http://127.0.0.1:53000",
    trace: "retain-on-failure",
  },
  workers: 1,
});

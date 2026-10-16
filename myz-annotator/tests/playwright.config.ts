import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./",
  // The extension's unit tests live under `tests/unit` and are run by Vitest,
  // not Playwright. Without this, Playwright's default `*.test.ts` match picks
  // them up and fails.
  testIgnore: ["**/unit/**"],
  timeout: 30_000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    // proxy: {
    //     server: 'http://127.0.0.1:7890/'
    // },
    screenshot: process.env.CI ? "only-on-failure" : "off",
    baseURL: undefined,
    // Headless by default; `HEADED=1` opts into a visible browser for debugging.
    // Extensions need the full Chromium channel under headless.
    headless: process.env.HEADED !== "1",
    channel: process.env.HEADED !== "1" ? "chromium" : undefined,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

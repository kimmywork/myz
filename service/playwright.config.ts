import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? "") || 3000;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;
const envFile = process.env.PLAYWRIGHT_ENV_FILE;
const webServerCommand = envFile
  ? `bash -c 'set -a && source "${envFile}" && npm run dev -- --port ${port}'`
  : `npm run dev -- --port ${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: webServerCommand,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NUXT_PUBLIC_DISABLE_AUTO_REDIRECT: "1",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

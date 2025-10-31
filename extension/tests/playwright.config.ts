import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './',
  timeout: 30_000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    // proxy: {
    //     server: 'http://127.0.0.1:7890/'
    // },
    screenshot: process.env.CI ? 'only-on-failure' : 'off',
    baseURL: undefined,
    headless: false, // extensions require headed mode
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  forbidOnly: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'pnpm start',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
  projects: [
    {
      name: 'fixture-chromium',
      testMatch: /fixture\..+\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'fixture-firefox',
      testMatch: /fixture\.core\.spec\.ts/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'fixture-webkit',
      testMatch: /fixture\.core\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'services',
      testMatch: /services\..+\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'visual',
      testMatch: /visual\..+\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

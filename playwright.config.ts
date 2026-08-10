import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
const protectionBypass = process.env.E2E_VERCEL_BYPASS_SECRET;
const bypassStorageState = '.codex-internal/evidence/operator/vercel-protection-storage-state.json';

export default defineConfig({
  globalSetup: './tests/e2e/global-setup.ts',
  testDir: './tests/e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  forbidOnly: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    ...(protectionBypass ? { storageState: bypassStorageState } : {}),
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
    /*
     * v8-A3. Layout that must hold in every engine, run in every engine.
     *
     * The notification overlap the owner hit on Firefox for Android already had a test
     * asserting exactly that geometry across eight phone widths — and it passed throughout,
     * because `visual` runs Desktop Chrome alone. These projects re-run only the
     * @crossbrowser-tagged tests, which is the subset deliberately kept free of CDP
     * (`newCDPSession` is Chromium-only, so the contrast sweeps cannot travel).
     */
    {
      name: 'visual-firefox',
      testMatch: /visual\..+\.spec\.ts/,
      grep: /@crossbrowser/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'visual-webkit',
      testMatch: /visual\..+\.spec\.ts/,
      grep: /@crossbrowser/,
      use: { ...devices['Desktop Safari'] },
    },
  ],
});

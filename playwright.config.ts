import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173';
const protectionBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    ...(protectionBypass
      ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': protectionBypass } }
      : {}),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev --host 127.0.0.1 --port 4173',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'fixture-chromium',
      testMatch: /fixture\..*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'visual-desktop',
      testMatch: /visual\..*\.spec\.ts/,
      use: { viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 1 },
    },
    {
      name: 'visual-mobile',
      testMatch: /visual\..*\.spec\.ts/,
      use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true },
    },
    {
      name: 'services-serial',
      testMatch: /services\..*\.spec\.ts/,
      fullyParallel: false,
      workers: 1,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

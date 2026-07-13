import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? '5173')
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`
const phase57EconomyAuthority = process.env.E2E_PHASE57_ECONOMY_AUTHORITY ?? 'disabled'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 90_000,
  use: {
    actionTimeout: 15_000,
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  expect: {
    timeout: 15_000,
  },
  reporter: 'list',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `VITE_PHASE57_ECONOMY_AUTHORITY=${phase57EconomyAuthority} npm run dev -- --host 127.0.0.1 --port ${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
    url: baseURL,
  },
})

import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? '5173')
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`
const phase57EconomyAuthority = process.env.E2E_PHASE57_ECONOMY_AUTHORITY ?? 'disabled'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: Number(process.env.E2E_WORKERS ?? '1'),
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
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `VITE_PHASE57_ECONOMY_AUTHORITY=${phase57EconomyAuthority} npm run dev -- --host 127.0.0.1 --port ${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
    url: baseURL,
  },
})

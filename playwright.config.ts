import { defineConfig, devices } from '@playwright/test'

/**
 * E2E config. Tests run against an already-running stack (the CI workflow
 * brings the production docker-compose up first; locally, run
 * `docker compose -f docker-compose.prod.yml up -d` then `pnpm test:e2e`).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})

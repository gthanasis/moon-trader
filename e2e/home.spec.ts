import { test, expect } from '@playwright/test'

const API_URL = process.env['E2E_API_URL'] ?? 'http://localhost:4000'

test('home page loads with the dashboard title', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.ok()).toBeTruthy()
  await expect(page).toHaveTitle(/Moon Trader/i)
})

test('dashboard renders without a runtime error', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toBeVisible()
  // Next.js shows this when a client component throws during render.
  await expect(page.getByText('Application error')).toHaveCount(0)
})

test('API health endpoint is reachable', async ({ request }) => {
  const res = await request.get(`${API_URL}/health`)
  expect(res.ok()).toBeTruthy()
  expect(await res.json()).toMatchObject({ status: 'ok' })
})

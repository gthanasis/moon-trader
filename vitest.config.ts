import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    // e2e/ holds Playwright specs — run via `pnpm test:e2e`, not vitest.
    exclude: ['**/.claude/**', '**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
})

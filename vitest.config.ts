import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@trader/core': resolve(__dirname, './packages/core/src'),
      '@trader/data': resolve(__dirname, './packages/data/src'),
      '@trader/shared': resolve(__dirname, './packages/shared/src'),
      '@trader/llm': resolve(__dirname, './packages/llm/src'),
      '@trader/backtest': resolve(__dirname, './packages/backtest/src'),
      '@trader/db': resolve(__dirname, './packages/db/src'),
      '@trader/bot': resolve(__dirname, './packages/bot/src'),
      '@trader/runner': resolve(__dirname, './packages/runner/src'),
    },
  },
  test: {
    globals: true,
    exclude: ['**/.claude/**', '**/node_modules/**'],
  },
})

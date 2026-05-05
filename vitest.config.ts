import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@trader/core': resolve(__dirname, './packages/core/dist'),
      '@trader/data': resolve(__dirname, './packages/data/dist'),
      '@trader/shared': resolve(__dirname, './packages/shared/dist'),
      '@trader/llm': resolve(__dirname, './packages/llm/dist'),
      '@trader/backtest': resolve(__dirname, './packages/backtest/dist'),
      '@trader/db': resolve(__dirname, './packages/db/dist'),
      '@trader/bot': resolve(__dirname, './packages/bot/dist'),
      '@trader/runner': resolve(__dirname, './packages/runner/dist'),
    },
  },
  test: {
    globals: true,
  },
})

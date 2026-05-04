import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@trader/core': resolve(__dirname, './packages/core/dist'),
      '@trader/data': resolve(__dirname, './packages/data/dist'),
      '@trader/shared': resolve(__dirname, './packages/shared/dist'),
    },
  },
  test: {
    globals: true,
  },
})

import { config as loadDotenv } from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

// Load .env from repo root
const __dirname = fileURLToPath(new URL('.', import.meta.url))
loadDotenv({ path: resolve(__dirname, '../../../.env') })

import { loadConfig } from './config.js'
import { startLiveTrader } from './live-runner.js'

let liveConfig
try {
  liveConfig = loadConfig()
} catch (err) {
  console.error('[LiveTrader] Missing configuration:', (err as Error).message)
  console.error('[LiveTrader] Fill in .env at the repo root and restart.')
  process.exit(1)
}

const handle = startLiveTrader(liveConfig)

process.on('SIGINT', () => {
  console.log('[LiveTrader] Shutting down...')
  handle.stop()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('[LiveTrader] SIGTERM received, shutting down...')
  handle.stop()
  process.exit(0)
})

import { loadConfig } from './config.js'
import { startLiveTrader } from './live-runner.js'

const config = loadConfig()
const handle = startLiveTrader(config)

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

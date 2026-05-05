export interface LiveConfig {
  binanceApiKey: string
  binanceSecret: string
  anthropicApiKey: string
  totalCapital: number
  autoTradeLimit: number
  coins: string[]
  timeframe: string
  ohlcvLimit: number
  cronExpression: string
  paper: boolean
}

export function loadConfig(): LiveConfig {
  function required(key: string): string {
    const val = process.env[key]
    if (!val) throw new Error(`Missing required env var: ${key}`)
    return val
  }

  function parseNumber(key: string, defaultValue: number): number {
    const raw = process.env[key]
    if (raw === undefined) return defaultValue
    const val = Number(raw)
    if (isNaN(val)) throw new Error(`Invalid numeric value for ${key}: "${raw}"`)
    return val
  }

  return {
    binanceApiKey: required('BINANCE_API_KEY'),
    binanceSecret: required('BINANCE_SECRET'),
    anthropicApiKey: required('ANTHROPIC_API_KEY'),
    totalCapital: parseNumber('TOTAL_CAPITAL', 1000),
    autoTradeLimit: parseNumber('AUTO_TRADE_LIMIT', 50),
    coins: (process.env['COINS'] ?? 'BTC/USDT,ETH/USDT').split(','),
    timeframe: process.env['TIMEFRAME'] ?? '15m',
    ohlcvLimit: parseNumber('OHLCV_LIMIT', 100),
    cronExpression: process.env['CRON_EXPRESSION'] ?? '*/15 * * * *',
    paper: process.env['PAPER'] !== 'false',
  }
}

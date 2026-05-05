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

  return {
    binanceApiKey: required('BINANCE_API_KEY'),
    binanceSecret: required('BINANCE_SECRET'),
    anthropicApiKey: required('ANTHROPIC_API_KEY'),
    totalCapital: Number(process.env['TOTAL_CAPITAL'] ?? '1000'),
    autoTradeLimit: Number(process.env['AUTO_TRADE_LIMIT'] ?? '50'),
    coins: (process.env['COINS'] ?? 'BTC/USDT,ETH/USDT').split(','),
    timeframe: process.env['TIMEFRAME'] ?? '15m',
    ohlcvLimit: Number(process.env['OHLCV_LIMIT'] ?? '100'),
    cronExpression: process.env['CRON_EXPRESSION'] ?? '*/15 * * * *',
    paper: process.env['PAPER'] !== 'false',
  }
}

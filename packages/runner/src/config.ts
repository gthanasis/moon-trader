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
  telegramBotToken?: string
  telegramChatId?: string
}

export function loadConfig(): LiveConfig {
  function required(key: string): string {
    const val = process.env[key]
    if (!val) throw new Error(`Missing required env var: ${key}`)
    return val
  }

  function parseNumber(key: string, defaultValue: number, minValue = 0): number {
    const raw = process.env[key]
    if (raw === undefined) return defaultValue
    const val = Number(raw)
    if (isNaN(val) || val <= minValue) throw new Error(`${key} must be a number greater than ${minValue}, got "${raw}"`)
    return val
  }

  return {
    binanceApiKey: required('BINANCE_API_KEY'),
    binanceSecret: required('BINANCE_SECRET'),
    anthropicApiKey: required('ANTHROPIC_API_KEY'),
    totalCapital: parseNumber('TOTAL_CAPITAL', 1000, 0),
    autoTradeLimit: parseNumber('AUTO_TRADE_LIMIT', 50, 0),
    coins: (process.env['COINS'] ?? 'BTC/USDT,ETH/USDT').split(','),
    timeframe: process.env['TIMEFRAME'] ?? '15m',
    ohlcvLimit: parseNumber('OHLCV_LIMIT', 100, 0),
    cronExpression: process.env['CRON_EXPRESSION'] ?? '*/15 * * * *',
    paper: process.env['PAPER'] !== 'false',
    telegramBotToken: process.env['TELEGRAM_BOT_TOKEN'],
    telegramChatId: process.env['TELEGRAM_CHAT_ID'],
  }
}

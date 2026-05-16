export interface LiveConfig {
  binanceApiKey: string
  binanceSecret: string
  llmProvider: 'anthropic' | 'openai'
  llmApiKey: string
  totalCapital: number
  autoTradeLimit: number
  coins: string[]
  timeframe: string
  ohlcvLimit: number
  cronExpression: string
  paper: boolean
  telegramBotToken?: string
  telegramChatId?: string
  /** Fraction of available capital risked per trade when a stop-loss is provided. Default: 0.01 (1%). */
  riskPerTradePct: number
  /** Minimum LLM confidence for a non-hold decision to execute. Default: 0.6. */
  minConfidence: number
  /** Maximum simultaneous open positions. Default: 5. */
  maxPositions: number
  /** Fraction of daily starting capital that can be lost before new buys are blocked. Default: 0.05. */
  dailyLossLimitPct: number
  /** Exchange fee rate as a fraction of trade size/proceeds. Default: 0.001 (0.1%). */
  feeRate: number
  /** Slippage applied to paper fills in basis points. Default: 5. */
  slippageBps: number
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

  const llmProvider = (process.env['LLM_PROVIDER'] ?? 'openai') as 'anthropic' | 'openai'
  const llmApiKey =
    llmProvider === 'openai'
      ? required('OPENAI_API_KEY')
      : required('ANTHROPIC_API_KEY')

  return {
    binanceApiKey: required('BINANCE_API_KEY'),
    binanceSecret: required('BINANCE_SECRET'),
    llmProvider,
    llmApiKey,
    totalCapital: parseNumber('TOTAL_CAPITAL', 1000, 0),
    autoTradeLimit: parseNumber('AUTO_TRADE_LIMIT', 50, 0),
    coins: (process.env['COINS'] ?? 'BTC/USDT,ETH/USDT').split(','),
    timeframe: process.env['TIMEFRAME'] ?? '15m',
    ohlcvLimit: parseNumber('OHLCV_LIMIT', 100, 0),
    cronExpression: process.env['CRON_EXPRESSION'] ?? '0 * * * *',
    paper: process.env['PAPER'] !== 'false',
    telegramBotToken: process.env['TELEGRAM_BOT_TOKEN'],
    telegramChatId: process.env['TELEGRAM_CHAT_ID'],
    riskPerTradePct: parseNumber('RISK_PER_TRADE_PCT', 0.01, 0),
    minConfidence: parseNumber('MIN_CONFIDENCE', 0.6, 0),
    maxPositions: parseNumber('MAX_POSITIONS', 5, 0),
    dailyLossLimitPct: parseNumber('DAILY_LOSS_LIMIT_PCT', 0.05, 0),
    feeRate: parseNumber('FEE_RATE', 0.001, 0),
    slippageBps: parseNumber('SLIPPAGE_BPS', 5, 0),
  }
}

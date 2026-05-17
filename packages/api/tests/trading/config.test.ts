import { describe, it, expect, beforeEach } from 'vitest'
import { loadConfig } from '../../src/trading/config'

function withEnv(vars: Record<string, string>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k]
    process.env[k] = v
  }
  try {
    fn()
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

// Includes an LLM provider + its key so loadConfig's provider check (which
// runs before the Binance check) passes — keeps tests independent of any
// ambient OPENAI_API_KEY / LLM_PROVIDER in the environment.
const requiredEnv = {
  BINANCE_API_KEY: 'test-key',
  BINANCE_SECRET: 'test-secret',
  LLM_PROVIDER: 'anthropic',
  ANTHROPIC_API_KEY: 'test-anthropic',
}

describe('loadConfig', () => {
  beforeEach(() => {
    // Clear every env var loadConfig reads so tests do not inherit the
    // developer's shell or .env. loadConfig validates the LLM provider key
    // before BINANCE_API_KEY, so OPENAI_API_KEY / LLM_PROVIDER must be cleared
    // too or those checks mask the one under test.
    for (const key of [
      'BINANCE_API_KEY', 'BINANCE_SECRET', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY',
      'LLM_PROVIDER', 'TOTAL_CAPITAL', 'AUTO_TRADE_LIMIT', 'OHLCV_LIMIT',
      'COINS', 'TIMEFRAME', 'PAPER', 'CRON_EXPRESSION',
      'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID',
    ]) {
      delete process.env[key]
    }
  })

  it('throws when BINANCE_API_KEY is missing', () => {
    // Satisfy the LLM provider check so BINANCE_API_KEY is the first failure.
    process.env['OPENAI_API_KEY'] = 'key'
    expect(() => loadConfig()).toThrow('BINANCE_API_KEY')
  })

  it('throws when BINANCE_SECRET is missing', () => {
    process.env['OPENAI_API_KEY'] = 'key'
    process.env['BINANCE_API_KEY'] = 'key'
    expect(() => loadConfig()).toThrow('BINANCE_SECRET')
  })

  it('throws when ANTHROPIC_API_KEY is missing and LLM_PROVIDER=anthropic', () => {
    process.env['BINANCE_API_KEY'] = 'key'
    process.env['BINANCE_SECRET'] = 'secret'
    process.env['LLM_PROVIDER'] = 'anthropic'
    try {
      expect(() => loadConfig()).toThrow('ANTHROPIC_API_KEY')
    } finally {
      delete process.env['LLM_PROVIDER']
    }
  })

  it('returns config with required values when all env vars set', () => {
    withEnv({ ...requiredEnv, LLM_PROVIDER: 'anthropic' }, () => {
      const config = loadConfig()
      expect(config.binanceApiKey).toBe('test-key')
      expect(config.binanceSecret).toBe('test-secret')
      expect(config.llmApiKey).toBe('test-anthropic')
    })
  })

  it('uses defaults for optional env vars', () => {
    withEnv(requiredEnv, () => {
      const config = loadConfig()
      expect(config.totalCapital).toBe(1000)
      expect(config.autoTradeLimit).toBe(50)
      expect(config.ohlcvLimit).toBe(100)
      expect(config.coins).toEqual(['BTC/USDT', 'ETH/USDT'])
      expect(config.timeframe).toBe('15m')
      expect(config.paper).toBe(true)
      expect(config.cronExpression).toBe('0 * * * *')
    })
  })

  it('parses COINS as comma-separated list', () => {
    withEnv({ ...requiredEnv, COINS: 'BTC/USDT,ETH/USDT,SOL/USDT' }, () => {
      const config = loadConfig()
      expect(config.coins).toEqual(['BTC/USDT', 'ETH/USDT', 'SOL/USDT'])
    })
  })

  it('sets paper=false when PAPER=false', () => {
    withEnv({ ...requiredEnv, PAPER: 'false' }, () => {
      const config = loadConfig()
      expect(config.paper).toBe(false)
    })
  })

  it('throws when TOTAL_CAPITAL is not a number', () => {
    withEnv({ ...requiredEnv, TOTAL_CAPITAL: 'abc' }, () => {
      expect(() => loadConfig()).toThrow('TOTAL_CAPITAL')
    })
  })

  it('throws when TOTAL_CAPITAL is zero', () => {
    withEnv({ ...requiredEnv, TOTAL_CAPITAL: '0' }, () => {
      expect(() => loadConfig()).toThrow('TOTAL_CAPITAL')
    })
  })

  it('includes telegramBotToken and telegramChatId as undefined when not set', () => {
    withEnv(requiredEnv, () => {
      const config = loadConfig()
      expect(config.telegramBotToken).toBeUndefined()
      expect(config.telegramChatId).toBeUndefined()
    })
  })

  it('reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID when set', () => {
    withEnv({
      ...requiredEnv,
      TELEGRAM_BOT_TOKEN: 'bot123:token',
      TELEGRAM_CHAT_ID: '987654',
    }, () => {
      const config = loadConfig()
      expect(config.telegramBotToken).toBe('bot123:token')
      expect(config.telegramChatId).toBe('987654')
    })
  })
})

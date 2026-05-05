import { describe, it, expect, beforeEach } from 'vitest'
import { loadConfig } from '../src/config.js'

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

const requiredEnv = {
  BINANCE_API_KEY: 'test-key',
  BINANCE_SECRET: 'test-secret',
  ANTHROPIC_API_KEY: 'test-anthropic',
}

describe('loadConfig', () => {
  beforeEach(() => {
    delete process.env['BINANCE_API_KEY']
    delete process.env['BINANCE_SECRET']
    delete process.env['ANTHROPIC_API_KEY']
    delete process.env['TOTAL_CAPITAL']
    delete process.env['AUTO_TRADE_LIMIT']
    delete process.env['OHLCV_LIMIT']
    delete process.env['COINS']
    delete process.env['TIMEFRAME']
    delete process.env['PAPER']
  })

  it('throws when BINANCE_API_KEY is missing', () => {
    expect(() => loadConfig()).toThrow('BINANCE_API_KEY')
  })

  it('throws when BINANCE_SECRET is missing', () => {
    process.env['BINANCE_API_KEY'] = 'key'
    expect(() => loadConfig()).toThrow('BINANCE_SECRET')
  })

  it('throws when ANTHROPIC_API_KEY is missing', () => {
    process.env['BINANCE_API_KEY'] = 'key'
    process.env['BINANCE_SECRET'] = 'secret'
    expect(() => loadConfig()).toThrow('ANTHROPIC_API_KEY')
  })

  it('returns config with required values when all env vars set', () => {
    withEnv(requiredEnv, () => {
      const config = loadConfig()
      expect(config.binanceApiKey).toBe('test-key')
      expect(config.binanceSecret).toBe('test-secret')
      expect(config.anthropicApiKey).toBe('test-anthropic')
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
      expect(config.cronExpression).toBe('*/15 * * * *')
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
})

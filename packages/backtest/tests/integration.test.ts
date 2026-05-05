import { describe, it, expect } from 'vitest'
import { BacktestRunner } from '../src/backtest-runner.js'
import type { BacktestConfig } from '../src/types.js'
import type { LLMDecision } from '@trader/shared'
import type { Candle } from '@trader/shared'

function makeCandle(timestamp: Date, open: number): Candle {
  return { timestamp, open, high: open * 1.01, low: open * 0.99, close: open * 1.005, volume: 100 }
}

describe('BacktestRunner integration', () => {
  it('runs a complete backtest and returns valid stats', async () => {
    // 4 hours of 15-min candles for BTC
    const candles: Candle[] = []
    const base = new Date('2024-01-01T00:00:00Z')
    for (let i = 0; i < 16; i++) {
      candles.push(makeCandle(new Date(base.getTime() + i * 15 * 60 * 1000), 50000 + i * 100))
    }

    let callCount = 0
    const adapter = {
      decide: async (): Promise<LLMDecision> => {
        callCount++
        if (callCount === 1) return { action: 'buy', coin: 'BTC', size: 200, confidence: 0.8, reasoning: 'test buy' }
        if (callCount === 3) return { action: 'sell', coin: 'BTC', size: 200, confidence: 0.8, reasoning: 'test sell' }
        return { action: 'hold', coin: 'BTC', size: 0, confidence: 0.5, reasoning: 'hold' }
      },
    }

    const from = base
    const to = new Date(base.getTime() + 4 * 60 * 60 * 1000) // 4 hours later

    const config: BacktestConfig = {
      from,
      to,
      initialCapital: 1000,
      autoTradeLimit: 500,
      coins: ['BTC'],
      sources: [],
      ohlcv: { BTC: candles },
      adapter,
      intervalMs: 15 * 60 * 1000,
    }

    const runner = new BacktestRunner(config)
    const result = await runner.run()

    expect(result.trades.length).toBeGreaterThan(0)
    expect(result.pnlCurve.length).toBeGreaterThan(0)
    expect(result.stats.totalTrades).toBe(result.trades.length)
    expect(result.stats.winRate).toBeGreaterThanOrEqual(0)
    expect(result.stats.winRate).toBeLessThanOrEqual(1)
    expect(result.stats.maxDrawdown).toBeGreaterThanOrEqual(0)
    expect(result.pnlCurve[0].capital).toBeGreaterThan(0)
  })
})

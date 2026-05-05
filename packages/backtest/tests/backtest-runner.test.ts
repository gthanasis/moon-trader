import { describe, it, expect, vi } from 'vitest'
import { BacktestRunner } from '../src/backtest-runner.js'
import type { BacktestConfig } from '../src/types.js'
import type { LLMDecision } from '@trader/shared'
import type { Candle } from '@trader/shared'
import type { DataSource } from '@trader/data'

function makeCandle(timestamp: Date, open: number, close = open): Candle {
  return { timestamp, open, high: open, low: open, close, volume: 1 }
}

const t0 = new Date('2024-01-01T00:00:00Z')
const t1 = new Date('2024-01-01T00:15:00Z')
const t2 = new Date('2024-01-01T00:30:00Z')
const t3 = new Date('2024-01-01T00:45:00Z')

function makeNullSource(): DataSource {
  return {
    id: 'null',
    fetch: async () => [],
    fetchHistorical: async () => [],
  }
}

describe('BacktestRunner', () => {
  it('returns empty trades when adapter always returns hold', async () => {
    const adapter = { decide: vi.fn(async (): Promise<LLMDecision> => ({
      action: 'hold', coin: 'BTC', size: 0, confidence: 0.5, reasoning: 'hold'
    })) }

    const config: BacktestConfig = {
      from: t0,
      to: t2,
      initialCapital: 1000,
      autoTradeLimit: 500,
      coins: ['BTC'],
      sources: [makeNullSource()],
      ohlcv: { BTC: [makeCandle(t0, 100), makeCandle(t1, 110), makeCandle(t2, 120)] },
      adapter,
      intervalMs: 15 * 60 * 1000,
    }

    const runner = new BacktestRunner(config)
    const result = await runner.run()

    expect(result.trades).toHaveLength(0)
    expect(adapter.decide).toHaveBeenCalled()
  })

  it('records a buy trade when adapter returns buy', async () => {
    let callCount = 0
    const adapter = {
      decide: vi.fn(async (): Promise<LLMDecision> => {
        callCount++
        if (callCount === 1) {
          return { action: 'buy', coin: 'BTC', size: 100, confidence: 0.9, reasoning: 'bullish' }
        }
        return { action: 'hold', coin: 'BTC', size: 0, confidence: 0.5, reasoning: 'hold' }
      }),
    }

    const config: BacktestConfig = {
      from: t0,
      to: t2,
      initialCapital: 1000,
      autoTradeLimit: 500,
      coins: ['BTC'],
      sources: [makeNullSource()],
      ohlcv: { BTC: [makeCandle(t0, 100), makeCandle(t1, 110), makeCandle(t2, 120)] },
      adapter,
      intervalMs: 15 * 60 * 1000,
    }

    const runner = new BacktestRunner(config)
    const result = await runner.run()

    expect(result.trades.length).toBeGreaterThanOrEqual(1)
    const buyTrade = result.trades.find(t => t.side === 'buy')
    expect(buyTrade).toBeDefined()
    expect(buyTrade!.coin).toBe('BTC')
    expect(buyTrade!.entryPrice).toBe(110) // fills at next candle open after t0
  })

  it('closes position when adapter returns sell after buy', async () => {
    let callCount = 0
    const adapter = {
      decide: vi.fn(async (): Promise<LLMDecision> => {
        callCount++
        if (callCount === 1) {
          return { action: 'buy', coin: 'BTC', size: 100, confidence: 0.9, reasoning: 'buy' }
        }
        if (callCount === 2) {
          return { action: 'sell', coin: 'BTC', size: 100, confidence: 0.9, reasoning: 'sell' }
        }
        return { action: 'hold', coin: 'BTC', size: 0, confidence: 0.5, reasoning: 'hold' }
      }),
    }

    const config: BacktestConfig = {
      from: t0,
      to: t3,
      initialCapital: 1000,
      autoTradeLimit: 500,
      coins: ['BTC'],
      sources: [makeNullSource()],
      ohlcv: {
        BTC: [
          makeCandle(t0, 100),
          makeCandle(t1, 110),
          makeCandle(t2, 120),
          makeCandle(t3, 130),
        ],
      },
      adapter,
      intervalMs: 15 * 60 * 1000,
    }

    const runner = new BacktestRunner(config)
    const result = await runner.run()

    const buyTrade = result.trades.find(t => t.side === 'buy' && t.closedAt !== undefined)
    expect(buyTrade).toBeDefined()
    expect(buyTrade!.exitPrice).toBeDefined()
    expect(buyTrade!.pnl).toBeDefined()
  })

  it('produces a pnlCurve with one point per step', async () => {
    const adapter = {
      decide: vi.fn(async (): Promise<LLMDecision> => ({
        action: 'hold', coin: 'BTC', size: 0, confidence: 0.5, reasoning: 'hold',
      })),
    }

    const config: BacktestConfig = {
      from: t0,
      to: t2,
      initialCapital: 1000,
      autoTradeLimit: 500,
      coins: ['BTC'],
      sources: [makeNullSource()],
      ohlcv: { BTC: [makeCandle(t0, 100), makeCandle(t1, 110), makeCandle(t2, 120)] },
      adapter,
      intervalMs: 15 * 60 * 1000,
    }

    const runner = new BacktestRunner(config)
    const result = await runner.run()

    // from=t0, to=t2, interval=15min → steps at t0 and t1 (t2 is exclusive)
    expect(result.pnlCurve.length).toBe(2)
  })

  it('skips buy when no fill price is available', async () => {
    const adapter = {
      decide: vi.fn(async (): Promise<LLMDecision> => ({
        action: 'buy', coin: 'BTC', size: 100, confidence: 0.9, reasoning: 'buy',
      })),
    }

    // Only one candle — no "next" candle to fill at
    const config: BacktestConfig = {
      from: t0,
      to: t1,
      initialCapital: 1000,
      autoTradeLimit: 500,
      coins: ['BTC'],
      sources: [makeNullSource()],
      ohlcv: { BTC: [makeCandle(t0, 100)] },
      adapter,
      intervalMs: 15 * 60 * 1000,
    }

    const runner = new BacktestRunner(config)
    const result = await runner.run()

    expect(result.trades).toHaveLength(0)
  })
})

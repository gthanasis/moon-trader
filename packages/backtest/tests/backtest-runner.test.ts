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
      slippageBps: 0,
      feeRate: 0,
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

    // from=t0, to=t2, interval=15min → steps at t0 and t1 plus one final point at t2
    expect(result.pnlCurve.length).toBe(3)
  })

  it('calls onStep once per step with correct step numbers and total', async () => {
    const intervalMs = 1000
    const from = new Date(0)
    const to = new Date(3 * intervalMs)

    const decision: LLMDecision = { action: 'hold', coin: 'BTC', size: 0, confidence: 0.5, reasoning: 'hold' }
    const adapter = { decide: vi.fn(async () => decision) }
    const onStep = vi.fn()

    const config: BacktestConfig = {
      from,
      to,
      initialCapital: 1000,
      autoTradeLimit: 500,
      coins: ['BTC'],
      sources: [makeNullSource()],
      ohlcv: { BTC: [] },
      adapter,
      intervalMs,
      onStep,
    }

    await new BacktestRunner(config).run()

    expect(onStep).toHaveBeenCalledTimes(3)
    expect(onStep).toHaveBeenNthCalledWith(1, 1, 3, new Date(0), decision)
    expect(onStep).toHaveBeenNthCalledWith(2, 2, 3, new Date(intervalMs), decision)
    expect(onStep).toHaveBeenNthCalledWith(3, 3, 3, new Date(2 * intervalMs), decision)
  })

  it('closes the most recently opened position first (LIFO) when selling', async () => {
    // Buy BTC twice at different prices, then sell once — should close the second buy (LIFO).
    // The sell decision happens at t2; force-close of the remaining position happens at end (t3+15min).
    // We distinguish explicit sell vs force-close by closedAt timestamp.
    let callCount = 0
    const adapter = {
      decide: vi.fn(async (): Promise<LLMDecision> => {
        callCount++
        if (callCount === 1) return { action: 'buy', coin: 'BTC', size: 100, confidence: 0.9, reasoning: 'buy1' }
        if (callCount === 2) return { action: 'buy', coin: 'BTC', size: 100, confidence: 0.9, reasoning: 'buy2' }
        if (callCount === 3) return { action: 'sell', coin: 'BTC', size: 100, confidence: 0.9, reasoning: 'sell' }
        return { action: 'hold', coin: 'BTC', size: 0, confidence: 0.5, reasoning: 'hold' }
      }),
    }

    const end = new Date(t3.getTime() + 15 * 60 * 1000)
    const config: BacktestConfig = {
      from: t0,
      to: end,
      initialCapital: 1000,
      autoTradeLimit: 500,
      coins: ['BTC'],
      sources: [makeNullSource()],
      ohlcv: {
        BTC: [
          makeCandle(t0, 100),  // fill for buy1 at t1 open → 110
          makeCandle(t1, 110),  // fill for buy2 at t2 open → 120
          makeCandle(t2, 120),  // fill for sell at t3 open → 130
          makeCandle(t3, 130),
        ],
      },
      adapter,
      intervalMs: 15 * 60 * 1000,
      slippageBps: 0,
      feeRate: 0,
    }

    const result = await new BacktestRunner(config).run()

    const buyTrades = result.trades.filter(t => t.side === 'buy')
    expect(buyTrades).toHaveLength(2)

    // LIFO: the sell at step 3 (decision at t2) closes the most recently opened position (entry 120).
    // Force-close at `end` closes the first position (entry 110).
    const explicitlySold = buyTrades.find(t => t.closedAt?.getTime() === t2.getTime())
    const forceClosed = buyTrades.find(t => t.closedAt?.getTime() === end.getTime())

    expect(explicitlySold).toBeDefined()
    expect(explicitlySold!.entryPrice).toBe(120) // LIFO: most recent first

    expect(forceClosed).toBeDefined()
    expect(forceClosed!.entryPrice).toBe(110) // first buy, closed at end
  })

  it('closes position via take-profit when candle high reaches the target', async () => {
    let callCount = 0
    const adapter = {
      decide: vi.fn(async (): Promise<LLMDecision> => {
        callCount++
        if (callCount === 1) return { action: 'buy', coin: 'BTC', size: 100, confidence: 0.9, reasoning: 'buy', takeProfit: 115 }
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
          makeCandle(t1, 110),           // buy fills here at open=110
          { ...makeCandle(t2, 120), high: 120 }, // high=120 ≥ takeProfit=115 → closes
          makeCandle(t3, 105),
        ],
      },
      adapter,
      intervalMs: 15 * 60 * 1000,
      slippageBps: 0,
      feeRate: 0,
    }

    const result = await new BacktestRunner(config).run()

    const trade = result.trades.find(t => t.closedAt !== undefined)
    expect(trade).toBeDefined()
    expect(trade!.exitPrice).toBe(115)   // filled at takeProfit price, not candle high
    expect(trade!.pnl).toBeGreaterThan(0)
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

  it('respects minConfidence — buy with confidence below threshold is not executed', async () => {
    // confidence 0.65 > default 0.6, so it would execute without the custom threshold;
    // with minConfidence: 0.7 set, it must be blocked
    const adapter = { decide: vi.fn(async (): Promise<LLMDecision> => ({
      action: 'buy', coin: 'BTC', size: 100, confidence: 0.65, reasoning: 'weak signal',
    })) }

    const config: BacktestConfig = {
      from: t0, to: t2,
      initialCapital: 1000, autoTradeLimit: 500,
      coins: ['BTC'], sources: [makeNullSource()],
      ohlcv: { BTC: [makeCandle(t0, 100), makeCandle(t1, 110), makeCandle(t2, 120)] },
      adapter, intervalMs: 15 * 60 * 1000,
      slippageBps: 0, feeRate: 0,
      minConfidence: 0.7,
    }

    const result = await new BacktestRunner(config).run()
    expect(result.trades).toHaveLength(0)
  })

  it('respects riskPerTradePct — with stopLoss provided, size is risk-budget based', async () => {
    // capital=1000, riskPerTradePct=0.01, stopLoss at 90 (10% below entry of 100) → stopDistance=0.10
    // risk-based size = 1000 * 0.01 / 0.10 = 100 (capped at autoTradeLimit=500)
    let capturedSize = 0
    const adapter = {
      decide: vi.fn(async (): Promise<LLMDecision> => {
        if (capturedSize === 0) {
          return { action: 'buy', coin: 'BTC', size: 9999, confidence: 0.9, reasoning: 'buy', stopLoss: 90 }
        }
        return { action: 'hold', coin: '', size: 0, confidence: 0.5, reasoning: 'hold' }
      }),
    }

    const ohlcv = { BTC: [makeCandle(t0, 100), makeCandle(t1, 100), makeCandle(t2, 100), makeCandle(t3, 100)] }
    const config: BacktestConfig = {
      from: t0, to: t3,
      initialCapital: 1000, autoTradeLimit: 500,
      coins: ['BTC'], sources: [makeNullSource()],
      ohlcv, adapter, intervalMs: 15 * 60 * 1000,
      slippageBps: 0, feeRate: 0,
      riskPerTradePct: 0.01,
    }

    const result = await new BacktestRunner(config).run()
    // Should have executed a buy with size ≈ 100, not the LLM's 9999
    expect(result.trades.length).toBeGreaterThan(0)
    expect(result.trades[0].size).toBeCloseTo(100, 0)
  })
})

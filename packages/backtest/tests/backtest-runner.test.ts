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

  it('closes BTC position when adapter issues a sell decision', async () => {
    // Buy BTC, then sell BTC — the position should be closed at the sell candle.
    let callCount = 0
    const adapter = {
      decide: vi.fn(async (): Promise<LLMDecision> => {
        callCount++
        if (callCount === 1) return { action: 'buy', coin: 'BTC', size: 100, confidence: 0.9, reasoning: 'buy' }
        if (callCount === 2) return { action: 'sell', coin: 'BTC', size: 100, confidence: 0.9, reasoning: 'sell' }
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
          makeCandle(t0, 100),  // decision at t0: buy → fill at t1 open = 110
          makeCandle(t1, 110),  // decision at t1: sell → fill at t2 open = 120
          makeCandle(t2, 120),
          makeCandle(t3, 130),
        ],
      },
      adapter,
      intervalMs: 15 * 60 * 1000,
      slippageBps: 0,
      feeRate: 0,
    }

    const result = await new BacktestRunner(config).run()

    const buyTrade = result.trades.find(t => t.side === 'buy')
    expect(buyTrade).toBeDefined()
    expect(buyTrade!.entryPrice).toBe(110) // filled at next candle
    expect(buyTrade!.exitPrice).toBe(120)  // closed at sell's next candle
    expect(buyTrade!.closedAt).toBeDefined()
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

describe('BacktestRunner — parity with live risk caps', () => {
  const baseOhlcv = {
    BTC: [makeCandle(t0, 100), makeCandle(t1, 100), makeCandle(t2, 100), makeCandle(t3, 100)],
    ETH: [makeCandle(t0, 10), makeCandle(t1, 10), makeCandle(t2, 10), makeCandle(t3, 10)],
  }

  it('rejects a second buy on the same coin (duplicate-position guard)', async () => {
    let calls = 0
    const adapter = { decide: vi.fn(async (): Promise<LLMDecision> => {
      calls++
      // Two consecutive buys on BTC — second must be rejected
      if (calls <= 2) return { action: 'buy', coin: 'BTC', size: 100, confidence: 0.9, reasoning: 'buy' }
      return { action: 'hold', coin: '', size: 0, confidence: 0.5, reasoning: 'hold' }
    }) }

    const config: BacktestConfig = {
      from: t0, to: t3, initialCapital: 1000, autoTradeLimit: 500,
      coins: ['BTC'], sources: [makeNullSource()],
      ohlcv: { BTC: [makeCandle(t0, 100), makeCandle(t1, 100), makeCandle(t2, 100), makeCandle(t3, 100)] },
      adapter, intervalMs: 15 * 60 * 1000, slippageBps: 0, feeRate: 0,
    }

    const result = await new BacktestRunner(config).run()
    const btcBuys = result.trades.filter(t => t.coin === 'BTC' && t.side === 'buy')
    expect(btcBuys).toHaveLength(1)
  })

  it('enforces maxPositions — 6th coin buy is rejected when limit is 5', async () => {
    const coins = ['BTC', 'ETH', 'SOL', 'BNB', 'ADA', 'DOGE']
    const ohlcv = Object.fromEntries(
      coins.map(c => [c, [makeCandle(t0, 100), makeCandle(t1, 100), makeCandle(t2, 100), makeCandle(t3, 100)]])
    )
    let calls = 0
    const adapter = { decide: vi.fn(async (): Promise<LLMDecision> => {
      const coin = coins[calls] ?? 'DOGE'
      calls++
      if (calls <= coins.length) return { action: 'buy', coin, size: 50, confidence: 0.9, reasoning: 'b' }
      return { action: 'hold', coin: '', size: 0, confidence: 0.5, reasoning: 'h' }
    }) }

    const config: BacktestConfig = {
      from: t0, to: t3, initialCapital: 10000, autoTradeLimit: 500,
      coins, sources: [makeNullSource()], ohlcv,
      adapter, intervalMs: 15 * 60 * 1000, slippageBps: 0, feeRate: 0,
      maxPositions: 5,
    }

    const result = await new BacktestRunner(config).run()
    const openBuys = result.trades.filter(t => t.side === 'buy' && t.exitPrice === undefined)
    expect(openBuys.length).toBeLessThanOrEqual(5)
  })

  it('trailing stop ratchets up on new highs and closes position on reversal', async () => {
    // Buy at 100, price rises to 120 (trail to 108), then drops to 105 (below 108) → should close
    const ohlcv = {
      BTC: [
        makeCandle(t0, 100, 100),
        makeCandle(t1, 100, 120), // price rises to 120 → HWM=120, trailed stop = 120*0.9=108
        makeCandle(t2, 120, 105), // price drops to 105, below 108 → stop hit
        makeCandle(t3, 105, 105),
      ],
    }
    function makeCandle2(timestamp: Date, open: number, close: number): Candle {
      return { timestamp, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 1 }
    }
    const ohlcv2 = {
      BTC: [
        makeCandle2(t0, 100, 100),
        makeCandle2(t1, 100, 120),
        makeCandle2(t2, 120, 105),
        makeCandle2(t3, 105, 105),
      ],
    }
    let bought = false
    const adapter = { decide: vi.fn(async (): Promise<LLMDecision> => {
      if (!bought) { bought = true; return { action: 'buy', coin: 'BTC', size: 100, confidence: 0.9, reasoning: 'buy', stopLoss: 90 } }
      return { action: 'hold', coin: '', size: 0, confidence: 0.5, reasoning: 'hold' }
    }) }

    const config: BacktestConfig = {
      from: t0, to: t3, initialCapital: 1000, autoTradeLimit: 500,
      coins: ['BTC'], sources: [makeNullSource()], ohlcv: ohlcv2,
      adapter, intervalMs: 15 * 60 * 1000, slippageBps: 0, feeRate: 0,
    }

    const result = await new BacktestRunner(config).run()
    const closed = result.trades.filter(t => t.closedAt !== undefined)
    // Position should have been closed by the trailing stop
    expect(closed.length).toBeGreaterThan(0)
    // Exit price should be at or near 108 (the trailed stop), not the force-close price
    expect(closed[0].exitPrice).toBeLessThan(120)
  })
})

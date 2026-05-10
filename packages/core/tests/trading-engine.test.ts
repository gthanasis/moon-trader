import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TradingEngine } from '../src/trading-engine.js'
import type { LLMDecision } from '@trader/shared'
import type { ExchangeAdapter, ExecutedOrder } from '../src/exchange-adapter.js'

describe('TradingEngine', () => {
  let engine: TradingEngine

  beforeEach(() => {
    engine = new TradingEngine({ totalCapital: 1000, paper: true })
  })

  it('executes a buy decision and opens a position', async () => {
    const decision: LLMDecision = {
      action: 'buy',
      coin: 'BTC/USDT',
      size: 200,
      confidence: 0.9,
      reasoning: 'strong signal',
      stopLoss: 48000,
      takeProfit: 55000,
    }

    const result = await engine.execute(decision)
    expect(result.executed).toBe(true)
    expect(engine.getPositions()).toHaveLength(1)
    expect(engine.availableCapital()).toBe(800)
  })

  it('rejects a trade that exceeds capital', async () => {
    const decision: LLMDecision = {
      action: 'buy',
      coin: 'ETH/USDT',
      size: 1500,
      confidence: 0.8,
      reasoning: 'too big',
    }

    const result = await engine.execute(decision)
    expect(result.executed).toBe(false)
    expect(result.reason).toMatch(/capital/i)
  })

  it('ignores hold decisions', async () => {
    const decision: LLMDecision = {
      action: 'hold',
      coin: 'BTC/USDT',
      size: 0,
      confidence: 0.5,
      reasoning: 'waiting',
    }

    const result = await engine.execute(decision)
    expect(result.executed).toBe(false)
    expect(result.reason).toBe('hold')
  })

  it('executes a sell and closes position', async () => {
    engine.updatePositionPrice('BTC/USDT', 50000)
    await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 200, confidence: 0.9, reasoning: 'buy' })
    const result = await engine.execute({ action: 'sell', coin: 'BTC/USDT', size: 200, confidence: 0.8, reasoning: 'sell' })

    expect(result.executed).toBe(true)
    expect(engine.getPositions()).toHaveLength(0)
  })

  it('reduces available capital after a losing paper sell', async () => {
    engine.updatePositionPrice('BTC/USDT', 50000)
    await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 200, confidence: 0.9, reasoning: 'buy' })

    // price drops to 40000 — a 20% loss on the position
    engine.updatePositionPrice('BTC/USDT', 40000)
    await engine.execute({ action: 'sell', coin: 'BTC/USDT', size: 200, confidence: 0.8, reasoning: 'sell' })

    // bought 200/50000 = 0.004 BTC, sold at 40000 → proceeds = 0.004 * 40000 = 160
    expect(engine.availableCapital()).toBeCloseTo(960, 0)
  })

  it('increases available capital after a winning paper sell', async () => {
    engine.updatePositionPrice('BTC/USDT', 50000)
    await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 200, confidence: 0.9, reasoning: 'buy' })

    engine.updatePositionPrice('BTC/USDT', 60000)
    await engine.execute({ action: 'sell', coin: 'BTC/USDT', size: 200, confidence: 0.8, reasoning: 'sell' })

    // bought 0.004 BTC at 50000, sold at 60000 → proceeds = 0.004 * 60000 = 240
    expect(engine.availableCapital()).toBeCloseTo(1040, 0)
  })
})

describe('TradingEngine live mode', () => {
  it('passes currentPrice to OrderManager when selling live', async () => {
    const sellSpy = vi.fn(async (): Promise<ExecutedOrder> => ({
      orderId: 'sell-1', fillPrice: 51000, filledAt: new Date(), baseAmount: 0.004,
    }))
    const exchange: ExchangeAdapter = {
      marketBuy: vi.fn(async (): Promise<ExecutedOrder> => ({
        orderId: 'buy-1', fillPrice: 50000, filledAt: new Date(), baseAmount: 0.004,
      })),
      marketSell: sellSpy,
    }
    const engine = new TradingEngine({ totalCapital: 1000, paper: false, exchange })

    // First buy to open a position
    await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 200, confidence: 0.9, reasoning: 'buy' })
    await engine.execute({ action: 'sell', coin: 'BTC/USDT', size: 200, confidence: 0.9, reasoning: 'sell' })

    expect(sellSpy).toHaveBeenCalled()
    // marketSell called with base amount = 200 / 50000 = 0.004
    const [coin, baseAmount] = (sellSpy as ReturnType<typeof vi.fn>).mock.calls[0] as [string, number]
    expect(coin).toBe('BTC/USDT')
    expect(baseAmount).toBeCloseTo(0.004, 5)
  })
})

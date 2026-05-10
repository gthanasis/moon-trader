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
    engine.updatePositionPrice('BTC/USDT', 50000)
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

  it('rejects a buy and leaves capital unchanged when fill price is zero', async () => {
    // No updatePositionPrice call → market price unknown → paper fill = 0
    const result = await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 200, confidence: 0.9, reasoning: 'buy' })

    expect(result.executed).toBe(false)
    expect(result.reason).toMatch(/invalid fill price/i)
    expect(engine.getPositions()).toHaveLength(0)
    expect(engine.availableCapital()).toBe(1000) // capital must be untouched
  })

  it('rejects a buy when a position for that coin is already open', async () => {
    engine.updatePositionPrice('BTC/USDT', 50000)
    await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 200, confidence: 0.9, reasoning: 'first buy' })

    const second = await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 100, confidence: 0.9, reasoning: 'second buy' })

    expect(second.executed).toBe(false)
    expect(second.reason).toMatch(/position already open/i)
    expect(engine.getPositions()).toHaveLength(1)
  })

  it('allows buys on different coins simultaneously', async () => {
    engine.updatePositionPrice('BTC/USDT', 50000)
    engine.updatePositionPrice('ETH/USDT', 3000)
    await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 100, confidence: 0.9, reasoning: 'btc' })
    const eth = await engine.execute({ action: 'buy', coin: 'ETH/USDT', size: 100, confidence: 0.9, reasoning: 'eth' })

    expect(eth.executed).toBe(true)
    expect(engine.getPositions()).toHaveLength(2)
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

describe('TradingEngine fees', () => {
  it('deducts buy fee from available capital', async () => {
    const engine = new TradingEngine({ totalCapital: 1000, paper: true, feeRate: 0.001 })
    engine.updatePositionPrice('BTC/USDT', 50000)
    await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 200, confidence: 0.9, reasoning: 'buy' })
    // capital = 1000 - 200 (size) - 0.2 (fee) = 799.8
    expect(engine.availableCapital()).toBeCloseTo(799.8, 1)
  })

  it('deducts sell fee from proceeds', async () => {
    const engine = new TradingEngine({ totalCapital: 1000, paper: true, feeRate: 0.001 })
    engine.updatePositionPrice('BTC/USDT', 50000)
    await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 200, confidence: 0.9, reasoning: 'buy' })
    // After buy: capital ≈ 799.8; sell at same price → proceeds = 200, fee = 0.2
    engine.updatePositionPrice('BTC/USDT', 50000)
    await engine.execute({ action: 'sell', coin: 'BTC/USDT', size: 200, confidence: 0.8, reasoning: 'sell' })
    // Net: started 1000, paid 0.2 buy fee + 0.2 sell fee = 999.6
    expect(engine.availableCapital()).toBeCloseTo(999.6, 1)
  })

  it('defaults to zero fees when feeRate is not set', async () => {
    const engine = new TradingEngine({ totalCapital: 1000, paper: true })
    engine.updatePositionPrice('BTC/USDT', 50000)
    await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 200, confidence: 0.9, reasoning: 'buy' })
    expect(engine.availableCapital()).toBe(800)
  })
})

describe('TradingEngine.checkStopLosses', () => {
  let engine: TradingEngine

  beforeEach(() => {
    engine = new TradingEngine({ totalCapital: 1000, paper: true })
  })

  it('closes a position when current price hits the take-profit level', async () => {
    engine.updatePositionPrice('BTC/USDT', 50000)
    await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 200, confidence: 0.9, reasoning: 'buy', takeProfit: 55000 })

    engine.updatePositionPrice('BTC/USDT', 55000) // price reached take-profit
    await engine.checkStopLosses()

    expect(engine.getPositions()).toHaveLength(0)
    expect(engine.availableCapital()).toBeGreaterThan(1000) // gain
  })

  it('does not close a position when price is below take-profit', async () => {
    engine.updatePositionPrice('BTC/USDT', 50000)
    await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 200, confidence: 0.9, reasoning: 'buy', takeProfit: 55000 })

    engine.updatePositionPrice('BTC/USDT', 54000) // not there yet
    await engine.checkStopLosses()

    expect(engine.getPositions()).toHaveLength(1)
  })

  it('raises stopLoss when price makes a new high (trailing stop)', async () => {
    engine.updatePositionPrice('BTC/USDT', 50000)
    await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 200, confidence: 0.9, reasoning: 'buy', stopLoss: 48000 })

    // price rises to 60000 — trailing stop should ratchet up
    engine.updatePositionPrice('BTC/USDT', 60000)
    await engine.checkStopLosses()

    // position should still be open (price above any stop)
    expect(engine.getPositions()).toHaveLength(1)
    // stopLoss on the position should now be above original 48000
    const pos = engine.getPositions()[0]
    expect(pos.stopLoss).toBeGreaterThan(48000)
  })

  it('closes position when price falls back below the trailed stop', async () => {
    engine.updatePositionPrice('BTC/USDT', 50000)
    await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 200, confidence: 0.9, reasoning: 'buy', stopLoss: 48000 })

    // price rises to 60000 — 10% trailing stop ratchets stopLoss to 54000
    engine.updatePositionPrice('BTC/USDT', 60000)
    await engine.checkStopLosses()

    // price falls to 53000, below the trailed stop of 54000
    engine.updatePositionPrice('BTC/USDT', 53000)
    await engine.checkStopLosses()

    expect(engine.getPositions()).toHaveLength(0)
  })
})

describe('TradingEngine max positions', () => {
  it('rejects a buy when maxPositions limit is reached', async () => {
    const engine = new TradingEngine({ totalCapital: 10000, paper: true, maxPositions: 2 })
    const coins = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']
    for (const coin of coins) engine.updatePositionPrice(coin, 100)

    await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 100, confidence: 0.9, reasoning: 'b1' })
    await engine.execute({ action: 'buy', coin: 'ETH/USDT', size: 100, confidence: 0.9, reasoning: 'b2' })
    const third = await engine.execute({ action: 'buy', coin: 'SOL/USDT', size: 100, confidence: 0.9, reasoning: 'b3' })

    expect(third.executed).toBe(false)
    expect(third.reason).toMatch(/max.*position/i)
    expect(engine.getPositions()).toHaveLength(2)
  })

  it('allows buying again after closing a position below the limit', async () => {
    const engine = new TradingEngine({ totalCapital: 10000, paper: true, maxPositions: 1 })
    engine.updatePositionPrice('BTC/USDT', 50000)
    engine.updatePositionPrice('ETH/USDT', 3000)

    await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 100, confidence: 0.9, reasoning: 'b1' })
    await engine.execute({ action: 'sell', coin: 'BTC/USDT', size: 100, confidence: 0.8, reasoning: 's1' })
    const eth = await engine.execute({ action: 'buy', coin: 'ETH/USDT', size: 100, confidence: 0.9, reasoning: 'b2' })

    expect(eth.executed).toBe(true)
    expect(engine.getPositions()).toHaveLength(1)
  })

  it('defaults to 5 max positions when not configured', async () => {
    const engine = new TradingEngine({ totalCapital: 10000, paper: true })
    const coins = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'ADA/USDT', 'DOGE/USDT']
    for (const coin of coins) engine.updatePositionPrice(coin, 100)
    for (const coin of coins.slice(0, 5)) {
      await engine.execute({ action: 'buy', coin, size: 100, confidence: 0.9, reasoning: 'b' })
    }

    const sixth = await engine.execute({ action: 'buy', coin: 'DOGE/USDT', size: 100, confidence: 0.9, reasoning: 'b6' })
    expect(sixth.executed).toBe(false)
    expect(sixth.reason).toMatch(/max.*position/i)
  })
})

describe('TradingEngine daily loss circuit breaker', () => {
  it('blocks a buy when daily loss exceeds the configured limit', async () => {
    const engine = new TradingEngine({ totalCapital: 1000, paper: true, dailyLossLimitPct: 0.05 })
    engine.updatePositionPrice('BTC/USDT', 50000)
    engine.updatePositionPrice('ETH/USDT', 3000)

    await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 200, confidence: 0.9, reasoning: 'buy' })
    // BTC drops 30% → 200 * 0.004 BTC sold at 35000 → proceeds = 140 → loss = 60 (6% of 1000)
    engine.updatePositionPrice('BTC/USDT', 35000)
    await engine.execute({ action: 'sell', coin: 'BTC/USDT', size: 200, confidence: 0.8, reasoning: 'sell' })

    const eth = await engine.execute({ action: 'buy', coin: 'ETH/USDT', size: 100, confidence: 0.9, reasoning: 'eth buy' })
    expect(eth.executed).toBe(false)
    expect(eth.reason).toMatch(/daily loss/i)
  })

  it('does not block buys when daily loss is within the limit', async () => {
    const engine = new TradingEngine({ totalCapital: 1000, paper: true, dailyLossLimitPct: 0.05 })
    engine.updatePositionPrice('BTC/USDT', 50000)
    engine.updatePositionPrice('ETH/USDT', 3000)

    await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 100, confidence: 0.9, reasoning: 'buy' })
    // BTC drops 2% → small loss, well within 5% limit
    engine.updatePositionPrice('BTC/USDT', 49000)
    await engine.execute({ action: 'sell', coin: 'BTC/USDT', size: 100, confidence: 0.8, reasoning: 'sell' })

    const eth = await engine.execute({ action: 'buy', coin: 'ETH/USDT', size: 100, confidence: 0.9, reasoning: 'eth buy' })
    expect(eth.executed).toBe(true)
  })

  it('resets daily loss tracking at the start of a new UTC day', async () => {
    const engine = new TradingEngine({ totalCapital: 1000, paper: true, dailyLossLimitPct: 0.05 })
    engine.updatePositionPrice('BTC/USDT', 50000)
    engine.updatePositionPrice('ETH/USDT', 3000)

    await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 200, confidence: 0.9, reasoning: 'buy' })
    engine.updatePositionPrice('BTC/USDT', 35000)
    await engine.execute({ action: 'sell', coin: 'BTC/USDT', size: 200, confidence: 0.8, reasoning: 'sell' })

    // Advance to next UTC day
    engine.advanceDay()

    const eth = await engine.execute({ action: 'buy', coin: 'ETH/USDT', size: 100, confidence: 0.9, reasoning: 'eth buy after reset' })
    expect(eth.executed).toBe(true)
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

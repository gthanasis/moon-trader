import { describe, it, expect } from 'vitest'
import { TradingEngine } from '@trader/core'
import { Pipeline, NullDataSource, FearAndGreedSource } from '@trader/data'

describe('Integration smoke test', () => {
  it('Pipeline with NullDataSource produces empty WorldSnapshot', async () => {
    const pipeline = new Pipeline({ sources: [new NullDataSource()] })
    const snapshot = await pipeline.fetch()

    expect(snapshot.signals).toHaveLength(0)
    expect(snapshot.ohlcv).toEqual({})
    expect(snapshot.timestamp).toBeInstanceOf(Date)
  })

  it('TradingEngine executes a buy in paper mode given a WorldSnapshot', async () => {
    const engine = new TradingEngine({ totalCapital: 500, paper: true })
    engine.updatePositionPrice('BTC/USDT', 50000)

    const result = await engine.execute({
      action: 'buy',
      coin: 'BTC/USDT',
      size: 100,
      confidence: 0.85,
      reasoning: 'smoke test signal',
    })

    expect(result.executed).toBe(true)
    expect(engine.getPositions()).toHaveLength(1)
    expect(engine.availableCapital()).toBe(400)
  })

  it('TradingEngine rejects an oversized buy', async () => {
    const engine = new TradingEngine({ totalCapital: 100, paper: true })

    const result = await engine.execute({
      action: 'buy',
      coin: 'ETH/USDT',
      size: 200,
      confidence: 0.9,
      reasoning: 'too large',
    })

    expect(result.executed).toBe(false)
    // size 200 > 25% of capital (25) → maxSinglePositionPct triggers before capital check
    expect(result.reason).toMatch(/exceeds max single position/)
    expect(engine.availableCapital()).toBe(100)
  })
})

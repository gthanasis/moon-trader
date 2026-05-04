import { describe, it, expect, beforeEach } from 'vitest'
import { TradingEngine } from '../src/trading-engine.js'
import type { LLMDecision } from '@trader/shared'

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
    await engine.execute({ action: 'buy', coin: 'BTC/USDT', size: 200, confidence: 0.9, reasoning: 'buy' })

    const sell: LLMDecision = { action: 'sell', coin: 'BTC/USDT', size: 200, confidence: 0.8, reasoning: 'sell' }
    const result = await engine.execute(sell)

    expect(result.executed).toBe(true)
    expect(engine.getPositions()).toHaveLength(0)
    expect(engine.availableCapital()).toBe(1000)
  })
})

import { describe, it, expect } from 'vitest'
import { TradingEngine } from '@trader/core'
import { Pipeline, NullDataSource } from '@trader/data'
import { EvaluationCycle, buildPrompt } from '@trader/llm'
import type { LLMAdapter } from '@trader/llm'
import type { TradingContext, LLMDecision } from '@trader/shared'

describe('LLM integration smoke test', () => {
  it('buildPrompt produces non-empty system and user strings', () => {
    const context: TradingContext = {
      snapshot: { timestamp: new Date(), signals: [], ohlcv: {} },
      positions: [],
      availableCapital: 500,
      recentTrades: [],
      openOrders: [],
    }
    const { system, user } = buildPrompt(context)
    expect(system.length).toBeGreaterThan(100)
    expect(user).toContain('500.00')
  })

  it('EvaluationCycle runs end-to-end with a stub adapter', async () => {
    const stubAdapter: LLMAdapter = {
      decide: async (_ctx: TradingContext): Promise<LLMDecision> => ({
        action: 'buy',
        coin: 'BTC/USDT',
        size: 50,
        confidence: 0.9,
        reasoning: 'stub decision',
      }),
    }

    const pipeline = new Pipeline({ sources: [new NullDataSource()] })
    const engine = new TradingEngine({ totalCapital: 500, paper: true })

    const cycle = new EvaluationCycle({
      pipeline,
      adapter: stubAdapter,
      engine,
      autoTradeLimit: 100,
    })

    const result = await cycle.run()
    expect(result.executed).toBe(true)
    expect(result.decision.coin).toBe('BTC/USDT')
    expect(engine.getPositions()).toHaveLength(1)
    expect(engine.availableCapital()).toBe(450)
  })

  it('EvaluationCycle holds without executing when stub returns hold', async () => {
    const stubAdapter: LLMAdapter = {
      decide: async (): Promise<LLMDecision> => ({
        action: 'hold', coin: '', size: 0, confidence: 0.3, reasoning: 'uncertain',
      }),
    }

    const pipeline = new Pipeline({ sources: [new NullDataSource()] })
    const engine = new TradingEngine({ totalCapital: 500, paper: true })

    const cycle = new EvaluationCycle({
      pipeline,
      adapter: stubAdapter,
      engine,
      autoTradeLimit: 100,
    })

    const result = await cycle.run()
    expect(result.executed).toBe(false)
    expect(engine.getPositions()).toHaveLength(0)
  })
})

import { vi, describe, it, expect, beforeEach } from 'vitest'
import { EvaluationCycle } from '../src/evaluation-cycle.js'
import type { CycleResult } from '../src/evaluation-cycle.js'
import type { LLMAdapter } from '../src/adapters/base.js'
import type { LLMDecision } from '@trader/shared'

const mockFetch = vi.fn()
const mockDecide = vi.fn()
const mockExecute = vi.fn()

const mockPipeline = {
  fetch: mockFetch,
  fetchHistorical: vi.fn(),
}

const mockAdapter: LLMAdapter = { decide: mockDecide }

const mockEngine = {
  execute: mockExecute,
  getPositions: vi.fn().mockReturnValue([]),
  getOpenOrders: vi.fn().mockReturnValue([]),
  availableCapital: vi.fn().mockReturnValue(1000),
  updatePositionPrice: vi.fn(),
  checkStopLosses: vi.fn().mockResolvedValue(undefined),
}

const emptySnapshot = { timestamp: new Date(), signals: [], ohlcv: {} }

const holdDecision: LLMDecision = { action: 'hold', coin: '', size: 0, confidence: 0.5, reasoning: 'uncertain' }
const buySmall: LLMDecision = { action: 'buy', coin: 'BTC/USDT', size: 30, confidence: 0.9, reasoning: 'strong' }
const buyLarge: LLMDecision = { action: 'buy', coin: 'BTC/USDT', size: 200, confidence: 0.9, reasoning: 'strong' }

describe('EvaluationCycle', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(emptySnapshot)
    mockDecide.mockReset()
    mockExecute.mockReset()
    mockExecute.mockResolvedValue({ executed: true })
  })

  it('returns hold result without executing when LLM decides to hold', async () => {
    mockDecide.mockResolvedValue(holdDecision)
    const cycle = new EvaluationCycle({ pipeline: mockPipeline as any, adapter: mockAdapter, engine: mockEngine as any, autoTradeLimit: 50 })
    const result = await cycle.run()
    expect(result.executed).toBe(false)
    expect(result.reason).toBe('hold')
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('auto-executes buy below autoTradeLimit without approval', async () => {
    mockDecide.mockResolvedValue(buySmall)
    const cycle = new EvaluationCycle({ pipeline: mockPipeline as any, adapter: mockAdapter, engine: mockEngine as any, autoTradeLimit: 50 })
    const result = await cycle.run()
    expect(result.executed).toBe(true)
    expect(mockExecute).toHaveBeenCalledWith(buySmall)
  })

  it('requests approval for buy above autoTradeLimit', async () => {
    mockDecide.mockResolvedValue(buyLarge)
    const onApprovalNeeded = vi.fn().mockResolvedValue(true)
    const cycle = new EvaluationCycle({ pipeline: mockPipeline as any, adapter: mockAdapter, engine: mockEngine as any, autoTradeLimit: 50, onApprovalNeeded })
    const result = await cycle.run()
    expect(onApprovalNeeded).toHaveBeenCalledWith(buyLarge)
    expect(result.executed).toBe(true)
  })

  it('does not execute when approval is rejected', async () => {
    mockDecide.mockResolvedValue(buyLarge)
    const onApprovalNeeded = vi.fn().mockResolvedValue(false)
    const cycle = new EvaluationCycle({ pipeline: mockPipeline as any, adapter: mockAdapter, engine: mockEngine as any, autoTradeLimit: 50, onApprovalNeeded })
    const result = await cycle.run()
    expect(result.executed).toBe(false)
    expect(result.reason).toMatch(/rejected/i)
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('auto-executes large trade when no onApprovalNeeded callback provided', async () => {
    mockDecide.mockResolvedValue(buyLarge)
    const cycle = new EvaluationCycle({ pipeline: mockPipeline as any, adapter: mockAdapter, engine: mockEngine as any, autoTradeLimit: 50 })
    const result = await cycle.run()
    expect(result.executed).toBe(true)
    expect(mockExecute).toHaveBeenCalled()
  })

  it('passes full TradingContext to adapter including positions and capital', async () => {
    mockDecide.mockResolvedValue(holdDecision)
    mockEngine.getPositions.mockReturnValue([{ coin: 'ETH/USDT', size: 100, entryPrice: 3000, currentPrice: 3100, openedAt: new Date() }])
    mockEngine.availableCapital.mockReturnValue(900)
    const cycle = new EvaluationCycle({ pipeline: mockPipeline as any, adapter: mockAdapter, engine: mockEngine as any, autoTradeLimit: 50 })
    await cycle.run()
    const contextArg = mockDecide.mock.calls[0][0]
    expect(contextArg.availableCapital).toBe(900)
    expect(contextArg.positions).toHaveLength(1)
  })
})

describe('EvaluationCycle — risk-based sizing (Task 5)', () => {
  const snapshotWith = (closePrice: number) => ({
    timestamp: new Date(),
    signals: [],
    ohlcv: {
      'BTC/USDT': [{ timestamp: new Date(), open: closePrice, high: closePrice, low: closePrice, close: closePrice, volume: 100 }],
    },
  })

  beforeEach(() => {
    mockDecide.mockReset()
    mockExecute.mockReset()
    mockExecute.mockResolvedValue({ executed: true })
    mockEngine.getPositions.mockReturnValue([])
    mockEngine.availableCapital.mockReturnValue(1000)
    mockEngine.checkStopLosses.mockResolvedValue(undefined)
  })

  it('sizes buy using risk% / stop-distance when stopLoss is provided', async () => {
    // entry ≈ 50000, stopLoss = 49000 → stopDistance = 2% → size = 1000 * 0.01 / 0.02 = 500
    mockFetch.mockResolvedValue(snapshotWith(50000))
    mockDecide.mockResolvedValue({ action: 'buy', coin: 'BTC/USDT', size: 9999, confidence: 0.9, reasoning: 'r', stopLoss: 49000 })
    const cycle = new EvaluationCycle({ pipeline: mockPipeline as any, adapter: mockAdapter, engine: mockEngine as any, autoTradeLimit: 600, riskPerTradePct: 0.01 })
    await cycle.run()
    const executedDecision = mockExecute.mock.calls[0][0] as LLMDecision
    expect(executedDecision.size).toBeCloseTo(500, 0)
  })

  it('caps risk-sized buy at autoTradeLimit', async () => {
    // entry = 50000, stopLoss = 49500 → stopDistance = 1% → size = 1000 * 0.01 / 0.01 = 1000 → cap at 200
    mockFetch.mockResolvedValue(snapshotWith(50000))
    mockDecide.mockResolvedValue({ action: 'buy', coin: 'BTC/USDT', size: 9999, confidence: 0.9, reasoning: 'r', stopLoss: 49500 })
    const cycle = new EvaluationCycle({ pipeline: mockPipeline as any, adapter: mockAdapter, engine: mockEngine as any, autoTradeLimit: 200, riskPerTradePct: 0.01 })
    await cycle.run()
    const executedDecision = mockExecute.mock.calls[0][0] as LLMDecision
    expect(executedDecision.size).toBe(200)
  })

  it('rejects buy when stop is too tight (< 0.3% away)', async () => {
    // entry = 50000, stopLoss = 49900 → stopDistance = 0.2% < 0.3%
    mockFetch.mockResolvedValue(snapshotWith(50000))
    mockDecide.mockResolvedValue({ action: 'buy', coin: 'BTC/USDT', size: 100, confidence: 0.9, reasoning: 'r', stopLoss: 49900 })
    const cycle = new EvaluationCycle({ pipeline: mockPipeline as any, adapter: mockAdapter, engine: mockEngine as any, autoTradeLimit: 500, riskPerTradePct: 0.01 })
    const result = await cycle.run()
    expect(result.executed).toBe(false)
    expect(result.reason).toMatch(/stop.*tight|too tight/i)
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('rejects buy when stop is too loose (> 15% away)', async () => {
    // entry = 50000, stopLoss = 40000 → stopDistance = 20% > 15%
    mockFetch.mockResolvedValue(snapshotWith(50000))
    mockDecide.mockResolvedValue({ action: 'buy', coin: 'BTC/USDT', size: 100, confidence: 0.9, reasoning: 'r', stopLoss: 40000 })
    const cycle = new EvaluationCycle({ pipeline: mockPipeline as any, adapter: mockAdapter, engine: mockEngine as any, autoTradeLimit: 500, riskPerTradePct: 0.01 })
    const result = await cycle.run()
    expect(result.executed).toBe(false)
    expect(result.reason).toMatch(/stop.*loose|too loose/i)
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('passes LLM size through unchanged when no stopLoss provided', async () => {
    mockFetch.mockResolvedValue(snapshotWith(50000))
    mockDecide.mockResolvedValue({ action: 'buy', coin: 'BTC/USDT', size: 75, confidence: 0.9, reasoning: 'r' })
    const cycle = new EvaluationCycle({ pipeline: mockPipeline as any, adapter: mockAdapter, engine: mockEngine as any, autoTradeLimit: 500, riskPerTradePct: 0.01 })
    await cycle.run()
    const executedDecision = mockExecute.mock.calls[0][0] as LLMDecision
    expect(executedDecision.size).toBe(75)
  })
})

describe('EvaluationCycle — confidence threshold (Task 6)', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(emptySnapshot)
    mockDecide.mockReset()
    mockExecute.mockReset()
    mockExecute.mockResolvedValue({ executed: true })
    mockEngine.getPositions.mockReturnValue([])
    mockEngine.availableCapital.mockReturnValue(1000)
    mockEngine.checkStopLosses.mockResolvedValue(undefined)
  })

  it('blocks non-hold decision when confidence is below threshold', async () => {
    mockDecide.mockResolvedValue({ action: 'buy', coin: 'BTC/USDT', size: 100, confidence: 0.55, reasoning: 'shaky' })
    const cycle = new EvaluationCycle({ pipeline: mockPipeline as any, adapter: mockAdapter, engine: mockEngine as any, autoTradeLimit: 500, minConfidence: 0.6 })
    const result = await cycle.run()
    expect(result.executed).toBe(false)
    expect(result.reason).toMatch(/confidence/i)
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('allows decision exactly at the confidence threshold', async () => {
    mockDecide.mockResolvedValue({ action: 'buy', coin: 'BTC/USDT', size: 100, confidence: 0.6, reasoning: 'ok' })
    const cycle = new EvaluationCycle({ pipeline: mockPipeline as any, adapter: mockAdapter, engine: mockEngine as any, autoTradeLimit: 500, minConfidence: 0.6 })
    const result = await cycle.run()
    expect(result.executed).toBe(true)
  })

  it('never gates hold decisions on confidence', async () => {
    mockDecide.mockResolvedValue({ action: 'hold', coin: 'BTC/USDT', size: 0, confidence: 0.1, reasoning: 'low' })
    const cycle = new EvaluationCycle({ pipeline: mockPipeline as any, adapter: mockAdapter, engine: mockEngine as any, autoTradeLimit: 500, minConfidence: 0.9 })
    const result = await cycle.run()
    expect(result.executed).toBe(false)
    expect(result.reason).toBe('hold') // not a confidence block
  })

  it('uses default threshold of 0.6 when minConfidence not set', async () => {
    mockDecide.mockResolvedValue({ action: 'buy', coin: 'BTC/USDT', size: 100, confidence: 0.59, reasoning: 'weak' })
    const cycle = new EvaluationCycle({ pipeline: mockPipeline as any, adapter: mockAdapter, engine: mockEngine as any, autoTradeLimit: 500 })
    const result = await cycle.run()
    expect(result.executed).toBe(false)
    expect(result.reason).toMatch(/confidence/i)
  })

  it('never gates sell decisions on confidence — low-confidence sells must pass through', async () => {
    mockDecide.mockResolvedValue({ action: 'sell', coin: 'BTC/USDT', size: 100, confidence: 0.3, reasoning: 'cut the loss' })
    mockExecute.mockResolvedValue({ executed: true })
    const cycle = new EvaluationCycle({
      pipeline: mockPipeline as any, adapter: mockAdapter, engine: mockEngine as any,
      autoTradeLimit: 500, minConfidence: 0.9,
    })
    const result = await cycle.run()
    expect(result.executed).toBe(true)
    expect(result.reason ?? '').not.toMatch(/confidence/i)
  })
})

// Appended after the existing describe block — reuses module-level mocks
describe('EvaluationCycle with notifier', () => {
  function makeNotifier() {
    return {
      tradeExecuted: vi.fn().mockResolvedValue(undefined),
      capitalAlert: vi.fn().mockResolvedValue(undefined),
      cycleError: vi.fn().mockResolvedValue(undefined),
    }
  }

  beforeEach(() => {
    mockFetch.mockResolvedValue(emptySnapshot)
    mockDecide.mockReset()
    mockExecute.mockReset()
    mockExecute.mockResolvedValue({ executed: true, order: { fillPrice: 50000 } })
    mockEngine.getPositions.mockReturnValue([])
    mockEngine.availableCapital.mockReturnValue(1000)
  })

  it('calls notifier.tradeExecuted after a successful auto-trade', async () => {
    mockDecide.mockResolvedValue(buySmall)
    const notifier = makeNotifier()
    const cycle = new EvaluationCycle({
      pipeline: mockPipeline as any,
      adapter: mockAdapter,
      engine: mockEngine as any,
      autoTradeLimit: 100,
      notifier,
    })

    const result: CycleResult = await cycle.run()

    expect(result.executed).toBe(true)
    expect(notifier.tradeExecuted).toHaveBeenCalledOnce()
    const call = notifier.tradeExecuted.mock.calls[0][0] as {
      coin: string; side: string; size: number; fillPrice: number; reasoning: string
    }
    expect(call.coin).toBe('BTC/USDT')
    expect(call.side).toBe('buy')
    expect(call.size).toBe(30)
    expect(call.reasoning).toBe('strong')
  })

  it('does not call notifier.tradeExecuted when decision is hold', async () => {
    mockDecide.mockResolvedValue(holdDecision)
    const notifier = makeNotifier()
    const cycle = new EvaluationCycle({
      pipeline: mockPipeline as any,
      adapter: mockAdapter,
      engine: mockEngine as any,
      autoTradeLimit: 100,
      notifier,
    })

    await cycle.run()

    expect(notifier.tradeExecuted).not.toHaveBeenCalled()
  })

  it('does not call notifier.tradeExecuted when approval is rejected', async () => {
    mockDecide.mockResolvedValue(buyLarge)
    const notifier = makeNotifier()
    const cycle = new EvaluationCycle({
      pipeline: mockPipeline as any,
      adapter: mockAdapter,
      engine: mockEngine as any,
      autoTradeLimit: 50,
      onApprovalNeeded: async () => false,
      notifier,
    })

    await cycle.run()

    expect(notifier.tradeExecuted).not.toHaveBeenCalled()
  })

  it('works without a notifier (backwards compatible)', async () => {
    mockDecide.mockResolvedValue(buySmall)
    const cycle = new EvaluationCycle({
      pipeline: mockPipeline as any,
      adapter: mockAdapter,
      engine: mockEngine as any,
      autoTradeLimit: 100,
    })

    await expect(cycle.run()).resolves.not.toThrow()
  })
})

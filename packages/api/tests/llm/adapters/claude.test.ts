import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { TradingContext } from '../../../src/common'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({ messages: { create: mockCreate } })),
}))

const { ClaudeAdapter } = await import('../../../src/llm/adapters/claude')

const emptyContext: TradingContext = {
  snapshot: { timestamp: new Date(), signals: [], ohlcv: {} },
  positions: [],
  availableCapital: 1000,
  recentTrades: [],
  openOrders: [],
}

const toolUseResponse = (input: object) => ({
  content: [{ type: 'tool_use', id: 'tu_1', name: 'make_trading_decision', input }],
})

describe('ClaudeAdapter', () => {
  beforeEach(() => mockCreate.mockReset())

  it('returns LLMDecision from tool use response', async () => {
    mockCreate.mockResolvedValue(toolUseResponse({
      action: 'buy', coin: 'BTC/USDT', size: 100, confidence: 0.85, reasoning: 'strong signal',
    }))
    const adapter = new ClaudeAdapter({ apiKey: 'test' })
    const [decision] = await adapter.decide(emptyContext)
    expect(decision.action).toBe('buy')
    expect(decision.coin).toBe('BTC/USDT')
    expect(decision.confidence).toBe(0.85)
  })

  it('falls back to hold when no tool_use block in response', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'I cannot decide' }] })
    const adapter = new ClaudeAdapter({ apiKey: 'test' })
    const [decision] = await adapter.decide(emptyContext)
    expect(decision.action).toBe('hold')
    expect(decision.reasoning).toMatch(/no tool use/i)
  })

  it('uses claude-sonnet-4-6 by default', async () => {
    mockCreate.mockResolvedValue(toolUseResponse({ action: 'hold', coin: '', size: 0, confidence: 0, reasoning: 'x' }))
    const adapter = new ClaudeAdapter({ apiKey: 'test' })
    await adapter.decide(emptyContext)
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-sonnet-4-6' }))
  })

  it('uses custom model when specified', async () => {
    mockCreate.mockResolvedValue(toolUseResponse({ action: 'hold', coin: '', size: 0, confidence: 0, reasoning: 'x' }))
    const adapter = new ClaudeAdapter({ apiKey: 'test', model: 'claude-haiku-4-5-20251001' })
    await adapter.decide(emptyContext)
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-haiku-4-5-20251001' }))
  })

  it('adds cache_control to system prompt block', async () => {
    mockCreate.mockResolvedValue(toolUseResponse({ action: 'hold', coin: '', size: 0, confidence: 0, reasoning: 'x' }))
    const adapter = new ClaudeAdapter({ apiKey: 'test' })
    await adapter.decide(emptyContext)
    const call = mockCreate.mock.calls[0][0]
    expect(call.system[0].cache_control).toEqual({ type: 'ephemeral' })
  })

  it('forces tool use with tool_choice any', async () => {
    mockCreate.mockResolvedValue(toolUseResponse({ action: 'hold', coin: '', size: 0, confidence: 0, reasoning: 'x' }))
    const adapter = new ClaudeAdapter({ apiKey: 'test' })
    await adapter.decide(emptyContext)
    const call = mockCreate.mock.calls[0][0]
    expect(call.tool_choice).toEqual({ type: 'any' })
  })

  it('returns one decision per tool_use block when the model emits several', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'tool_use', id: 'tu_1', name: 'make_trading_decision', input: { action: 'buy', coin: 'BTC/USDT', size: 50, confidence: 0.8, reasoning: 'a' } },
        { type: 'tool_use', id: 'tu_2', name: 'make_trading_decision', input: { action: 'hold', coin: 'ETH/USDT', size: 0, confidence: 0.4, reasoning: 'b' } },
      ],
    })
    const adapter = new ClaudeAdapter({ apiKey: 'test' })
    const decisions = await adapter.decide(emptyContext)
    expect(decisions).toHaveLength(2)
    expect(decisions[0].coin).toBe('BTC/USDT')
    expect(decisions[1].coin).toBe('ETH/USDT')
  })
})

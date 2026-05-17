import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { TradingContext } from '../../../src/common'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('openai', () => ({
  default: vi.fn(() => ({ chat: { completions: { create: mockCreate } } })),
}))

const { OpenAIAdapter } = await import('../../../src/llm/adapters/openai')

const emptyContext: TradingContext = {
  snapshot: { timestamp: new Date(), signals: [], ohlcv: {} },
  positions: [],
  availableCapital: 1000,
  recentTrades: [],
  openOrders: [],
}

const toolCallResponse = (args: object) => ({
  choices: [{
    message: {
      tool_calls: [{
        id: 'call_1',
        type: 'function',
        function: { name: 'make_trading_decision', arguments: JSON.stringify(args) },
      }],
    },
  }],
})

describe('OpenAIAdapter', () => {
  beforeEach(() => mockCreate.mockReset())

  it('returns LLMDecision from tool call response', async () => {
    mockCreate.mockResolvedValue(toolCallResponse({
      action: 'sell', coin: 'ETH/USDT', size: 150, confidence: 0.75, reasoning: 'profit taking',
    }))
    const adapter = new OpenAIAdapter({ apiKey: 'test' })
    const [decision] = await adapter.decide(emptyContext)
    expect(decision.action).toBe('sell')
    expect(decision.coin).toBe('ETH/USDT')
    expect(decision.confidence).toBe(0.75)
  })

  it('falls back to hold when no tool call in response', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { tool_calls: undefined } }] })
    const adapter = new OpenAIAdapter({ apiKey: 'test' })
    const [decision] = await adapter.decide(emptyContext)
    expect(decision.action).toBe('hold')
    expect(decision.reasoning).toMatch(/no tool call/i)
  })

  it('uses gpt-4o by default', async () => {
    mockCreate.mockResolvedValue(toolCallResponse({ action: 'hold', coin: '', size: 0, confidence: 0, reasoning: 'x' }))
    const adapter = new OpenAIAdapter({ apiKey: 'test' })
    await adapter.decide(emptyContext)
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4o' }))
  })

  it('uses custom model when specified', async () => {
    mockCreate.mockResolvedValue(toolCallResponse({ action: 'hold', coin: '', size: 0, confidence: 0, reasoning: 'x' }))
    const adapter = new OpenAIAdapter({ apiKey: 'test', model: 'gpt-4o-mini' })
    await adapter.decide(emptyContext)
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4o-mini' }))
  })

  it('forces at least one tool call with tool_choice required', async () => {
    mockCreate.mockResolvedValue(toolCallResponse({ action: 'hold', coin: '', size: 0, confidence: 0, reasoning: 'x' }))
    const adapter = new OpenAIAdapter({ apiKey: 'test' })
    await adapter.decide(emptyContext)
    const call = mockCreate.mock.calls[0][0]
    expect(call.tool_choice).toBe('required')
  })

  it('returns one decision per tool call when the model emits several', async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: {
          tool_calls: [
            { id: 'c1', type: 'function', function: { name: 'make_trading_decision', arguments: JSON.stringify({ action: 'buy', coin: 'BTC/USDT', size: 50, confidence: 0.8, reasoning: 'a' }) } },
            { id: 'c2', type: 'function', function: { name: 'make_trading_decision', arguments: JSON.stringify({ action: 'hold', coin: 'ETH/USDT', size: 0, confidence: 0.4, reasoning: 'b' }) } },
          ],
        },
      }],
    })
    const adapter = new OpenAIAdapter({ apiKey: 'test' })
    const decisions = await adapter.decide(emptyContext)
    expect(decisions).toHaveLength(2)
    expect(decisions[0].coin).toBe('BTC/USDT')
    expect(decisions[1].coin).toBe('ETH/USDT')
  })
})

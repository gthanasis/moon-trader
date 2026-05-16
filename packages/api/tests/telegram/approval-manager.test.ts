import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApprovalManager } from '../../src/telegram/approval-manager'
import type { LLMDecision } from '../../src/common'

// Mock grammy Bot — each Bot instance gets its own handlers array and sendMessage mock
vi.mock('grammy', () => {
  const Bot = vi.fn().mockImplementation(() => {
    const callbackHandlers: Array<(ctx: unknown) => Promise<void>> = []
    const sendMessage = vi.fn()
    return {
      api: { sendMessage },
      on: vi.fn((event: string, handler: (ctx: unknown) => Promise<void>) => {
        if (event === 'callback_query:data') callbackHandlers.push(handler)
      }),
      // Expose for test access
      _callbackHandlers: callbackHandlers,
    }
  })
  return {
    Bot,
    InlineKeyboard: vi.fn().mockImplementation(() => ({
      text: vi.fn().mockReturnThis(),
      row: vi.fn().mockReturnThis(),
    })),
  }
})

import { Bot } from 'grammy'

function getBotInstance() {
  return (Bot as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value as {
    api: { sendMessage: ReturnType<typeof vi.fn> }
    on: ReturnType<typeof vi.fn>
    _callbackHandlers: Array<(ctx: unknown) => Promise<void>>
  }
}

const mockDecision: LLMDecision = {
  action: 'buy',
  coin: 'ETH/USDT',
  size: 200,
  confidence: 0.82,
  reasoning: 'Strong on-chain inflow',
}

describe('ApprovalManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('requestApproval resolves "approved" when ✅ button is pressed', async () => {
    const manager = new ApprovalManager('token', '123456', { timeoutMs: 60_000 })
    const bot = getBotInstance()
    const messageId = 42
    bot.api.sendMessage.mockResolvedValue({ message_id: messageId })

    const promise = manager.requestApproval(mockDecision)

    // Simulate callback_query for approve
    await bot._callbackHandlers[0]?.({
      callbackQuery: {
        data: 'approve',
        message: { message_id: messageId },
      },
      answerCallbackQuery: vi.fn(),
    })

    await expect(promise).resolves.toBe('approved')
  })

  it('requestApproval resolves "rejected" when ❌ button is pressed', async () => {
    const manager = new ApprovalManager('token', '123456', { timeoutMs: 60_000 })
    const bot = getBotInstance()
    const messageId = 43
    bot.api.sendMessage.mockResolvedValue({ message_id: messageId })

    const promise = manager.requestApproval(mockDecision)

    await bot._callbackHandlers[0]?.({
      callbackQuery: {
        data: 'reject',
        message: { message_id: messageId },
      },
      answerCallbackQuery: vi.fn(),
    })

    await expect(promise).resolves.toBe('rejected')
  })

  it('requestApproval resolves "timeout" after timeoutMs with no interaction', async () => {
    const manager = new ApprovalManager('token', '123456', { timeoutMs: 5_000 })
    const bot = getBotInstance()
    bot.api.sendMessage.mockResolvedValue({ message_id: 44 })

    const promise = manager.requestApproval(mockDecision)

    vi.advanceTimersByTime(5_000)

    await expect(promise).resolves.toBe('timeout')
  })

  it('sends message containing coin, size, confidence and reasoning', async () => {
    const manager = new ApprovalManager('token', '123456', { timeoutMs: 60_000 })
    const bot = getBotInstance()
    bot.api.sendMessage.mockResolvedValue({ message_id: 45 })

    // Don't await — just check the send call
    void manager.requestApproval(mockDecision)

    // Allow the async sendMessage to be called
    await Promise.resolve()

    expect(bot.api.sendMessage).toHaveBeenCalledOnce()
    const [chatId, text] = bot.api.sendMessage.mock.calls[0] as [string, string, unknown]
    expect(chatId).toBe('123456')
    expect(text).toContain('ETH/USDT')
    expect(text).toContain('200')
    expect(text).toContain('0.82')
    expect(text).toContain('Strong on-chain inflow')
  })

  it('removes pending entry from Map after resolution so a second callback is ignored', async () => {
    const manager = new ApprovalManager('token', '123456', { timeoutMs: 60_000 })
    const bot = getBotInstance()
    const messageId = 46
    bot.api.sendMessage.mockResolvedValue({ message_id: messageId })

    const promise = manager.requestApproval(mockDecision)
    const ctx = {
      callbackQuery: { data: 'approve', message: { message_id: messageId } },
      answerCallbackQuery: vi.fn(),
    }

    await bot._callbackHandlers[0]?.(ctx)
    // Second call — should not throw or re-resolve
    await bot._callbackHandlers[0]?.(ctx)

    await expect(promise).resolves.toBe('approved')
  })
})

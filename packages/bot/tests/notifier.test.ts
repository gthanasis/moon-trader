import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BotNotifier } from '../src/notifier.js'

// Mock grammy Bot so no real Telegram calls happen
vi.mock('grammy', () => {
  const sendMessage = vi.fn().mockResolvedValue({})
  const Bot = vi.fn().mockImplementation(() => ({
    api: { sendMessage },
  }))
  return { Bot }
})

import { Bot } from 'grammy'

function getApiMock() {
  // Retrieve the sendMessage mock from the most recently constructed Bot instance
  const instance = (Bot as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value as {
    api: { sendMessage: ReturnType<typeof vi.fn> }
  }
  return instance.api.sendMessage
}

describe('BotNotifier', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('tradeExecuted sends a message containing coin, side, size, price and reasoning', async () => {
    const notifier = new BotNotifier('token', '123456')
    const sendMessage = getApiMock()

    await notifier.tradeExecuted({
      coin: 'BTC/USDT',
      side: 'buy',
      size: 200,
      fillPrice: 50000,
      reasoning: 'Strong momentum',
    })

    expect(sendMessage).toHaveBeenCalledOnce()
    const [chatId, text] = sendMessage.mock.calls[0] as [string, string]
    expect(chatId).toBe('123456')
    expect(text).toContain('BUY')
    expect(text).toContain('$200')
    expect(text).toContain('BTC/USDT')
    expect(text).toContain('50000')
    expect(text).toContain('Strong momentum')
  })

  it('tradeExecuted uppercases side', async () => {
    const notifier = new BotNotifier('token', '123456')
    const sendMessage = getApiMock()

    await notifier.tradeExecuted({
      coin: 'ETH/USDT',
      side: 'sell',
      size: 100,
      fillPrice: 3000,
      reasoning: 'Take profit',
    })

    const [, text] = sendMessage.mock.calls[0] as [string, string]
    expect(text).toContain('SELL')
  })

  it('capitalAlert sends a message with deployed and total amounts', async () => {
    const notifier = new BotNotifier('token', '123456')
    const sendMessage = getApiMock()

    await notifier.capitalAlert(850, 1000)

    expect(sendMessage).toHaveBeenCalledOnce()
    const [chatId, text] = sendMessage.mock.calls[0] as [string, string]
    expect(chatId).toBe('123456')
    expect(text).toContain('850')
    expect(text).toContain('1000')
  })

  it('cycleError sends a message with the error message', async () => {
    const notifier = new BotNotifier('token', '123456')
    const sendMessage = getApiMock()

    await notifier.cycleError(new Error('Rate limit hit'))

    expect(sendMessage).toHaveBeenCalledOnce()
    const [chatId, text] = sendMessage.mock.calls[0] as [string, string]
    expect(chatId).toBe('123456')
    expect(text).toContain('Rate limit hit')
  })
})

import { describe, it, expect } from 'vitest'
import { buildPrompt } from '../src/prompt-builder.js'
import type { TradingContext } from '@trader/shared'

const emptyContext: TradingContext = {
  snapshot: { timestamp: new Date(), signals: [], ohlcv: {} },
  positions: [],
  availableCapital: 1000,
  recentTrades: [],
  openOrders: [],
}

describe('buildPrompt', () => {
  it('includes available capital in user message', () => {
    const { user } = buildPrompt(emptyContext)
    expect(user).toContain('1000.00')
  })

  it('shows no open positions message when positions are empty', () => {
    const { user } = buildPrompt(emptyContext)
    expect(user).toContain('No open positions')
  })

  it('includes position details when positions exist', () => {
    const context: TradingContext = {
      ...emptyContext,
      positions: [{
        coin: 'BTC/USDT',
        size: 200,
        entryPrice: 50000,
        currentPrice: 55000,
        openedAt: new Date(),
      }],
    }
    const { user } = buildPrompt(context)
    expect(user).toContain('BTC/USDT')
    expect(user).toContain('50000')
    expect(user).toContain('55000')
  })

  it('includes signal content in user message', () => {
    const context: TradingContext = {
      ...emptyContext,
      snapshot: {
        timestamp: new Date(),
        signals: [{
          source: 'test',
          type: 'sentiment',
          content: 'Fear index: 25',
          timestamp: new Date(),
        }],
        ohlcv: {},
      },
    }
    const { user } = buildPrompt(context)
    expect(user).toContain('Fear index: 25')
  })

  it('limits signals to 20 most recent', () => {
    const signals = Array.from({ length: 25 }, (_, i) => ({
      source: 'test',
      type: 'news' as const,
      content: `Signal ${i}`,
      timestamp: new Date(Date.now() - i * 1000),
    }))
    const context: TradingContext = {
      ...emptyContext,
      snapshot: { timestamp: new Date(), signals, ohlcv: {} },
    }
    const { user } = buildPrompt(context)
    expect(user).toContain('Signal 0')
    expect(user).not.toContain('Signal 24')
  })

  it('system prompt instructs use of make_trading_decision tool', () => {
    const { system } = buildPrompt(emptyContext)
    expect(system).toContain('make_trading_decision')
  })

  it('system prompt mentions hold as default when uncertain', () => {
    const { system } = buildPrompt(emptyContext)
    expect(system).toContain('hold')
  })

  it('shows no recent trades message when trades are empty', () => {
    const { user } = buildPrompt(emptyContext)
    expect(user).toContain('No recent trades')
  })

  it('includes recent trade details when trades exist', () => {
    const context: TradingContext = {
      ...emptyContext,
      recentTrades: [{
        id: '1',
        coin: 'ETH/USDT',
        side: 'buy',
        size: 100,
        entryPrice: 3000,
        openedAt: new Date(),
        pnl: 5.2,
      }],
    }
    const { user } = buildPrompt(context)
    expect(user).toContain('ETH/USDT')
  })
})

import { describe, it, expect, vi } from 'vitest'

// Mock @trader/backtest before importing actions
vi.mock('@trader/backtest', () => ({
  BacktestRunner: vi.fn().mockImplementation(() => ({
    run: vi.fn(async () => ({
      trades: [],
      stats: {
        totalPnl: 150,
        totalFees: 2,
        winRate: 0.6,
        maxDrawdown: 0.05,
        sharpeRatio: 1.2,
        calmarRatio: 1.5,
        profitFactor: 2.0,
        avgWin: 30,
        avgLoss: -15,
        avgHoldTimeMs: 3600000,
        totalTrades: 10,
        initialCapital: 1000,
      },
      pnlCurve: [
        { timestamp: new Date('2025-01-01'), capital: 1000 },
        { timestamp: new Date('2025-01-02'), capital: 1150 },
      ],
    })),
  })),
}))

// Mock @trader/db
vi.mock('@trader/db', () => ({
  candleRepository: {
    findCandles: vi.fn(async () => []),
  },
}))

// Mock @trader/llm
vi.mock('@trader/llm', () => ({
  ClaudeAdapter: vi.fn().mockImplementation(() => ({})),
  OpenAIAdapter: vi.fn().mockImplementation(() => ({})),
}))

import { runBacktest } from '../app/backtest/actions'

describe('runBacktest server action', () => {
  it('returns BacktestResult for valid form data', async () => {
    // Set required env var
    process.env['ANTHROPIC_API_KEY'] = 'test-key'

    const formData = new FormData()
    formData.set('from', '2025-01-01')
    formData.set('to', '2025-01-31')
    formData.set('initialCapital', '1000')
    formData.set('coins', 'BTC/USDT,ETH/USDT')
    formData.set('model', 'claude-haiku-4-5')

    const result = await runBacktest(formData)

    expect(result.stats.totalPnl).toBe(150)
    expect(result.stats.totalTrades).toBe(10)
    expect(result.pnlCurve).toHaveLength(2)
  })

  it('throws when from date is missing', async () => {
    const formData = new FormData()
    formData.set('to', '2025-01-31')
    formData.set('initialCapital', '1000')
    formData.set('coins', 'BTC/USDT')

    await expect(runBacktest(formData)).rejects.toThrow('from')
  })

  it('throws when to date is missing', async () => {
    const formData = new FormData()
    formData.set('from', '2025-01-01')
    formData.set('initialCapital', '1000')
    formData.set('coins', 'BTC/USDT')

    await expect(runBacktest(formData)).rejects.toThrow('to')
  })
})

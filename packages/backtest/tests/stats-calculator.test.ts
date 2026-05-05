import { describe, it, expect } from 'vitest'
import { calculateStats } from '../src/stats-calculator.js'
import type { BacktestTrade, PnlPoint } from '../src/types.js'

function makeTrade(
  overrides: Partial<BacktestTrade> & { pnl: number; side?: 'buy' | 'sell' },
): BacktestTrade {
  return {
    coin: 'BTC',
    side: overrides.side ?? 'buy',
    size: 100,
    entryPrice: 50000,
    exitPrice: 50000,
    openedAt: new Date('2024-01-01T00:00:00Z'),
    closedAt: new Date('2024-01-01T01:00:00Z'),
    reasoning: 'test',
    ...overrides,
  }
}

describe('calculateStats', () => {
  it('calculates totalPnl as sum of all trade pnl', () => {
    const trades = [makeTrade({ pnl: 10 }), makeTrade({ pnl: -5 }), makeTrade({ pnl: 20 })]
    const curve: PnlPoint[] = []

    const stats = calculateStats(trades, 1000, curve)

    expect(stats.totalPnl).toBe(25)
  })

  it('calculates winRate as fraction of profitable trades', () => {
    const trades = [
      makeTrade({ pnl: 10 }),
      makeTrade({ pnl: 20 }),
      makeTrade({ pnl: -5 }),
      makeTrade({ pnl: 0 }),
    ]

    const stats = calculateStats(trades, 1000, [])

    expect(stats.winRate).toBeCloseTo(0.5) // 2 profitable out of 4
  })

  it('calculates winRate as 0 when no trades', () => {
    const stats = calculateStats([], 1000, [])
    expect(stats.winRate).toBe(0)
  })

  it('calculates maxDrawdown as largest peak-to-trough drop in capital', () => {
    const curve: PnlPoint[] = [
      { timestamp: new Date('2024-01-01'), capital: 1000 },
      { timestamp: new Date('2024-01-02'), capital: 1200 }, // peak
      { timestamp: new Date('2024-01-03'), capital: 900 },  // trough → drawdown = 300
      { timestamp: new Date('2024-01-04'), capital: 1100 },
    ]

    const stats = calculateStats([], 1000, curve)

    expect(stats.maxDrawdown).toBeCloseTo(300)
  })

  it('calculates maxDrawdown as 0 when curve is monotonically increasing', () => {
    const curve: PnlPoint[] = [
      { timestamp: new Date('2024-01-01'), capital: 1000 },
      { timestamp: new Date('2024-01-02'), capital: 1100 },
      { timestamp: new Date('2024-01-03'), capital: 1200 },
    ]

    const stats = calculateStats([], 1000, curve)

    expect(stats.maxDrawdown).toBe(0)
  })

  it('calculates avgHoldTimeMs for closed trades', () => {
    const open = new Date('2024-01-01T00:00:00Z')
    const close1 = new Date('2024-01-01T01:00:00Z') // 1h = 3_600_000ms
    const close2 = new Date('2024-01-01T03:00:00Z') // 3h = 10_800_000ms
    const trades = [
      makeTrade({ pnl: 0, openedAt: open, closedAt: close1 }),
      makeTrade({ pnl: 0, openedAt: open, closedAt: close2 }),
    ]

    const stats = calculateStats(trades, 1000, [])

    expect(stats.avgHoldTimeMs).toBe(7_200_000) // avg of 1h and 3h = 2h
  })

  it('sets avgHoldTimeMs to 0 when no closed trades', () => {
    const trade = makeTrade({ pnl: 10, closedAt: undefined })
    const stats = calculateStats([trade], 1000, [])
    expect(stats.avgHoldTimeMs).toBe(0)
  })

  it('reports totalTrades count', () => {
    const trades = [makeTrade({ pnl: 1 }), makeTrade({ pnl: 2 })]
    const stats = calculateStats(trades, 1000, [])
    expect(stats.totalTrades).toBe(2)
  })

  it('returns sharpeRatio of 0 when fewer than 2 curve points', () => {
    const curve: PnlPoint[] = [{ timestamp: new Date(), capital: 1000 }]
    const stats = calculateStats([], 1000, curve)
    expect(stats.sharpeRatio).toBe(0)
  })
})

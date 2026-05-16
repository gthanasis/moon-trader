import { describe, it, expect } from 'vitest'
import {
  floorTo6h,
  floorToDay,
  floorToWeek,
  floorToMonth,
  periodEndOf,
} from '../../src/narration/narration-periods'
import { aggregateStats } from '../../src/narration/narration-stats'

describe('narration period boundaries', () => {
  it('floorTo6h snaps to 00/06/12/18 UTC', () => {
    expect(floorTo6h(new Date('2026-05-16T14:37:00Z')).toISOString()).toBe('2026-05-16T12:00:00.000Z')
    expect(floorTo6h(new Date('2026-05-16T05:59:00Z')).toISOString()).toBe('2026-05-16T00:00:00.000Z')
  })

  it('floorToDay snaps to UTC midnight', () => {
    expect(floorToDay(new Date('2026-05-16T14:37:00Z')).toISOString()).toBe('2026-05-16T00:00:00.000Z')
  })

  it('floorToWeek snaps to UTC Monday', () => {
    // 2026-05-16 is a Saturday → week starts Monday 2026-05-11
    expect(floorToWeek(new Date('2026-05-16T14:00:00Z')).toISOString()).toBe('2026-05-11T00:00:00.000Z')
  })

  it('floorToMonth snaps to the first of the month', () => {
    expect(floorToMonth(new Date('2026-05-16T14:00:00Z')).toISOString()).toBe('2026-05-01T00:00:00.000Z')
  })

  it('periodEndOf advances by the right span', () => {
    const start = new Date('2026-05-01T00:00:00Z')
    expect(periodEndOf('6h', start).toISOString()).toBe('2026-05-01T06:00:00.000Z')
    expect(periodEndOf('day', start).toISOString()).toBe('2026-05-02T00:00:00.000Z')
    expect(periodEndOf('week', start).toISOString()).toBe('2026-05-08T00:00:00.000Z')
    expect(periodEndOf('month', start).toISOString()).toBe('2026-06-01T00:00:00.000Z')
  })
})

describe('aggregateStats', () => {
  it('sums child stats and recomputes win rate', () => {
    const result = aggregateStats([
      { pnl: 10, trades: 2, wins: 1, losses: 1, winRate: 0.5 },
      { pnl: -5, trades: 2, wins: 1, losses: 1, winRate: 0.5 },
      { pnl: 8, trades: 0, wins: 0, losses: 0, winRate: 0 },
    ])
    expect(result.pnl).toBe(13)
    expect(result.trades).toBe(4)
    expect(result.wins).toBe(2)
    expect(result.winRate).toBe(0.5)
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NarrationService } from '../../src/narration/narration.service'
import { computeStats } from '../../src/narration/narration-stats'
import { periodEndOf } from '../../src/narration/narration-periods'
import type { Trade, Narration } from '../../src/common'
import type { TradeRepository } from '../../src/prisma/repositories/trade.repository'
import type { DecisionRepository } from '../../src/prisma/repositories/decision.repository'
import type { NarrationRepository } from '../../src/prisma/repositories/narration.repository'
import type { NarrationLlmService } from '../../src/narration/narration-llm.service'

function trade(pnl: number): Trade {
  return {
    id: `t-${pnl}`, coin: 'BTC/USDT', side: 'buy', size: 100,
    entryPrice: 100, openedAt: new Date(), closedAt: new Date(), pnl,
  }
}

describe('computeStats', () => {
  it('aggregates pnl, wins, losses and win rate', () => {
    const s = computeStats([trade(10), trade(-4), trade(6), trade(0)])
    expect(s.pnl).toBe(12)
    expect(s.trades).toBe(4)
    expect(s.wins).toBe(2)
    expect(s.losses).toBe(1) // 0 counts as neither
    expect(s.winRate).toBe(0.5)
  })

  it('is zero-safe for an empty period', () => {
    expect(computeStats([])).toEqual({ pnl: 0, trades: 0, wins: 0, losses: 0, winRate: 0 })
  })
})

describe('NarrationService.generateBlock', () => {
  let trades: TradeRepository
  let decisions: DecisionRepository
  let narrations: NarrationRepository
  let llm: NarrationLlmService
  let service: NarrationService

  beforeEach(() => {
    trades = { findClosedBetween: vi.fn(async () => [trade(10), trade(-4)]) } as unknown as TradeRepository
    decisions = { findBetween: vi.fn(async () => []) } as unknown as DecisionRepository
    narrations = { upsert: vi.fn(async () => undefined) } as unknown as NarrationRepository
    llm = {
      narrate: vi.fn(async () => ({ summary: 'Made one win, one loss.', assessment: 'Within risk limits.' })),
    } as unknown as NarrationLlmService
    service = new NarrationService(trades, decisions, narrations, llm)
  })

  it('upserts a 6h narration with computed stats and LLM text', async () => {
    const periodStart = new Date('2026-05-16T00:00:00Z')
    await service.generateBlock(periodStart)

    expect(llm.narrate).toHaveBeenCalledOnce()
    const upsert = narrations.upsert as ReturnType<typeof vi.fn>
    const arg = upsert.mock.calls[0][0] as Record<string, unknown>
    expect(arg['granularity']).toBe('6h')
    expect(arg['periodStart']).toBe(periodStart)
    expect(arg['periodEnd']).toEqual(periodEndOf('6h', periodStart))
    expect(arg['summary']).toBe('Made one win, one loss.')
    expect(arg['assessment']).toBe('Within risk limits.')
    expect(arg['stats']).toEqual({ pnl: 6, trades: 2, wins: 1, losses: 1, winRate: 0.5 })
  })

  it('queries trades and decisions for the 6h window', async () => {
    const periodStart = new Date('2026-05-16T06:00:00Z')
    await service.generateBlock(periodStart)
    expect(trades.findClosedBetween).toHaveBeenCalledWith(periodStart, periodEndOf('6h', periodStart))
    expect(decisions.findBetween).toHaveBeenCalledWith(periodStart, periodEndOf('6h', periodStart))
  })
})

function childNarration(pnl: number): Narration {
  return {
    id: `c-${pnl}`, granularity: '6h',
    periodStart: new Date(), periodEnd: new Date(),
    summary: 's', assessment: null,
    stats: { pnl, trades: 1, wins: pnl > 0 ? 1 : 0, losses: pnl < 0 ? 1 : 0, winRate: pnl > 0 ? 1 : 0 },
    createdAt: new Date(),
  }
}

describe('NarrationService.generateRollup', () => {
  let trades: TradeRepository
  let decisions: DecisionRepository
  let narrations: NarrationRepository
  let llm: NarrationLlmService
  let service: NarrationService

  beforeEach(() => {
    trades = { findClosedBetween: vi.fn(async () => []) } as unknown as TradeRepository
    decisions = { findBetween: vi.fn(async () => []) } as unknown as DecisionRepository
    narrations = {
      upsert: vi.fn(async () => undefined),
      findChildren: vi.fn(async () => [childNarration(10), childNarration(-3)]),
    } as unknown as NarrationRepository
    llm = {
      narrate: vi.fn(async () => ({ summary: 'A solid day overall.', assessment: 'Consistent.' })),
    } as unknown as NarrationLlmService
    service = new NarrationService(trades, decisions, narrations, llm)
  })

  it('aggregates child stats into the roll-up narration', async () => {
    await service.generateRollup('day', new Date('2026-05-16T00:00:00Z'))
    const upsert = narrations.upsert as ReturnType<typeof vi.fn>
    const arg = upsert.mock.calls[0][0] as Record<string, unknown>
    expect(arg['granularity']).toBe('day')
    expect(arg['stats']).toEqual({ pnl: 7, trades: 2, wins: 1, losses: 1, winRate: 0.5 })
    expect(arg['summary']).toBe('A solid day overall.')
  })

  it('falls back to raw generation when there are no children', async () => {
    ;(narrations.findChildren as ReturnType<typeof vi.fn>).mockResolvedValue([])
    await service.generateRollup('day', new Date('2026-05-16T00:00:00Z'))
    // raw path queries trades for the window
    expect(trades.findClosedBetween).toHaveBeenCalledOnce()
  })
})

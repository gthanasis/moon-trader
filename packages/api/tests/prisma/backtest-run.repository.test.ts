import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BacktestRunRepository } from '../../src/prisma/repositories/backtest-run.repository'
import type { BacktestRunConfig, StepDecision } from '../../src/prisma/repositories/backtest-run.repository'
import type { PrismaService } from '../../src/prisma/prisma.service'
import type { BacktestResult } from '../../src/common'

function makeMockPrisma() {
  return {
    backtestRun: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  } as unknown as PrismaService
}

const config: BacktestRunConfig = {
  from: new Date('2026-01-01'),
  to: new Date('2026-02-01'),
  coins: ['BTC/USDT', 'ETH/USDT'],
  model: 'claude-sonnet-4-6',
  intervalMs: 3600000,
  initialCapital: 10000,
}

const result: BacktestResult = {
  trades: [
    {
      coin: 'BTC/USDT', side: 'buy', size: 0.1,
      entryPrice: 50000, exitPrice: 52000,
      openedAt: new Date('2026-01-05'), closedAt: new Date('2026-01-10'),
      pnl: 200, reasoning: 'bullish signal',
    },
  ],
  stats: {
    initialCapital: 10000, totalPnl: 200, totalFees: 4, winRate: 1,
    maxDrawdown: 0.02, sharpeRatio: 1.5, calmarRatio: 2, profitFactor: 3,
    avgWin: 200, avgLoss: 0, avgHoldTimeMs: 432000000, totalTrades: 1,
  },
  pnlCurve: [
    { timestamp: new Date('2026-01-01'), capital: 10000 },
    { timestamp: new Date('2026-02-01'), capital: 10200 },
  ],
}

const decisions: StepDecision[] = [
  {
    timestamp: '2026-01-05T00:00:00Z',
    action: 'buy',
    coin: 'BTC/USDT',
    size: 0.1,
    confidence: 0.8,
    reasoning: 'bullish signal',
  },
]

describe('BacktestRunRepository', () => {
  let prisma: PrismaService
  let repo: BacktestRunRepository

  beforeEach(() => { prisma = makeMockPrisma(); repo = new BacktestRunRepository(prisma) })

  it('create calls prisma.backtestRun.create with status=running and returns the id', async () => {
    const mockCreate = prisma.backtestRun.create as ReturnType<typeof vi.fn>
    mockCreate.mockResolvedValue({ id: 'run-123' })

    const id = await repo.create(config)

    expect(id).toBe('run-123')
    const args = mockCreate.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(args.data['status']).toBe('running')
    expect(args.data['coins']).toEqual(config.coins)
    expect(args.data['initialCapital']).toBe(config.initialCapital)
  })

  it('complete calls prisma.backtestRun.update with status=done and result fields', async () => {
    const mockUpdate = prisma.backtestRun.update as ReturnType<typeof vi.fn>
    mockUpdate.mockResolvedValue({})

    await repo.complete('run-123', result, decisions)

    const args = mockUpdate.mock.calls[0][0] as { where: Record<string, unknown>; data: Record<string, unknown> }
    expect(args.where['id']).toBe('run-123')
    expect(args.data['status']).toBe('done')
    expect(args.data['stats']).toEqual(result.stats)
    expect(args.data['trades']).toEqual(result.trades)
    expect(args.data['pnlCurve']).toEqual(result.pnlCurve)
    expect(args.data['decisions']).toEqual(decisions)
  })

  it('fail calls prisma.backtestRun.update with status=error and errorMessage', async () => {
    const mockUpdate = prisma.backtestRun.update as ReturnType<typeof vi.fn>
    mockUpdate.mockResolvedValue({})

    await repo.fail('run-456', 'something went wrong')

    const args = mockUpdate.mock.calls[0][0] as { where: Record<string, unknown>; data: Record<string, unknown> }
    expect(args.where['id']).toBe('run-456')
    expect(args.data['status']).toBe('error')
    expect(args.data['errorMessage']).toBe('something went wrong')
  })
})

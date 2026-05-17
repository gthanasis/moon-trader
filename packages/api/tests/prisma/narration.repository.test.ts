import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NarrationRepository, type NarrationInput } from '../../src/prisma/repositories/narration.repository'
import type { PrismaService } from '../../src/prisma/prisma.service'

function makeMockPrisma() {
  return {
    narration: { upsert: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  } as unknown as PrismaService
}

const sampleInput: NarrationInput = {
  granularity: '6h',
  periodStart: new Date('2026-05-16T00:00:00Z'),
  periodEnd: new Date('2026-05-16T06:00:00Z'),
  summary: 'Quiet block — bot held BTC through a small dip.',
  assessment: 'Sensible: no overtrading.',
  stats: { pnl: 12.5, trades: 1, wins: 1, losses: 0, winRate: 1 },
}

describe('NarrationRepository', () => {
  let prisma: PrismaService
  let repo: NarrationRepository

  beforeEach(() => {
    prisma = makeMockPrisma()
    repo = new NarrationRepository(prisma)
  })

  it('upsert keys on (granularity, periodStart) with identical create/update data', async () => {
    const mockUpsert = prisma.narration.upsert as ReturnType<typeof vi.fn>
    mockUpsert.mockResolvedValue({})
    await repo.upsert(sampleInput)

    const args = mockUpsert.mock.calls[0][0] as Record<string, Record<string, unknown>>
    expect(args['where']['granularity_periodStart']).toEqual({
      granularity: '6h',
      periodStart: sampleInput.periodStart,
    })
    expect(args['create']['summary']).toBe(sampleInput.summary)
    expect(args['update']['summary']).toBe(sampleInput.summary)
  })

  it('find queries by granularity within [from, to)', async () => {
    const mockFindMany = prisma.narration.findMany as ReturnType<typeof vi.fn>
    mockFindMany.mockResolvedValue([])
    const from = new Date('2026-05-01')
    const to = new Date('2026-06-01')
    await repo.find('day', from, to)

    const args = mockFindMany.mock.calls[0][0] as Record<string, Record<string, unknown>>
    expect(args['where']['granularity']).toBe('day')
    expect(args['where']['periodStart']).toEqual({ gte: from, lt: to })
  })

  it('findChildren of a day queries 6h narrations within the period', async () => {
    const mockFindMany = prisma.narration.findMany as ReturnType<typeof vi.fn>
    mockFindMany.mockResolvedValue([])
    const start = new Date('2026-05-16T00:00:00Z')
    const end = new Date('2026-05-17T00:00:00Z')
    await repo.findChildren('day', start, end)

    const args = mockFindMany.mock.calls[0][0] as Record<string, Record<string, unknown>>
    expect(args['where']['granularity']).toBe('6h')
  })

  it('findChildren of the finest level (6h) returns [] without querying', async () => {
    const mockFindMany = prisma.narration.findMany as ReturnType<typeof vi.fn>
    const result = await repo.findChildren('6h', new Date(), new Date())
    expect(result).toEqual([])
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('findOne maps a row to the domain shape', async () => {
    const mockFindUnique = prisma.narration.findUnique as ReturnType<typeof vi.fn>
    mockFindUnique.mockResolvedValue({
      id: 'n1',
      granularity: '6h',
      periodStart: sampleInput.periodStart,
      periodEnd: sampleInput.periodEnd,
      summary: sampleInput.summary,
      assessment: sampleInput.assessment,
      stats: sampleInput.stats,
      createdAt: new Date(),
    })
    const result = await repo.findOne('6h', sampleInput.periodStart)
    expect(result?.id).toBe('n1')
    expect(result?.stats.pnl).toBe(12.5)
  })
})

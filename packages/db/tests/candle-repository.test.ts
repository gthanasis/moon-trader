import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Candle } from '@trader/shared'
import { CandleRepository } from '../src/repositories/candle-repository.js'
import type { PrismaClient } from '@prisma/client'

function makeMockPrisma() {
  return {
    candle: { createMany: vi.fn(), findMany: vi.fn() },
  } as unknown as PrismaClient
}

const domainCandle: Candle = {
  timestamp: new Date('2026-05-05T10:00:00Z'),
  open: 60000, high: 61000, low: 59500, close: 60500, volume: 1200,
}

describe('CandleRepository', () => {
  let prisma: PrismaClient
  let repo: CandleRepository

  beforeEach(() => { prisma = makeMockPrisma(); repo = new CandleRepository(prisma) })

  it('saveCandles calls createMany with coin and timeframe attached', async () => {
    const mockCreateMany = prisma.candle.createMany as ReturnType<typeof vi.fn>
    mockCreateMany.mockResolvedValue({ count: 1 })
    await repo.saveCandles('BTC/USDT', '15m', [domainCandle])
    const args = mockCreateMany.mock.calls[0][0] as { data: Record<string, unknown>[]; skipDuplicates: boolean }
    expect(args.skipDuplicates).toBe(true)
    expect(args.data[0]['coin']).toBe('BTC/USDT')
    expect(args.data[0]['timeframe']).toBe('15m')
    expect(args.data[0]['open']).toBe(60000)
  })

  it('saveCandles does nothing when given an empty array', async () => {
    const mockCreateMany = prisma.candle.createMany as ReturnType<typeof vi.fn>
    await repo.saveCandles('BTC/USDT', '15m', [])
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it('findCandles calls findMany with coin, timeframe, and date range', async () => {
    const mockFindMany = prisma.candle.findMany as ReturnType<typeof vi.fn>
    mockFindMany.mockResolvedValue([])
    const from = new Date('2026-05-05T00:00:00Z')
    const to = new Date('2026-05-05T12:00:00Z')
    await repo.findCandles('BTC/USDT', '15m', from, to)
    const args = mockFindMany.mock.calls[0][0] as Record<string, unknown>
    const where = args['where'] as Record<string, unknown>
    expect(where['coin']).toBe('BTC/USDT')
    expect(where['timeframe']).toBe('15m')
    const ts = where['timestamp'] as Record<string, Date>
    expect(ts['gte']).toEqual(from)
    expect(ts['lt']).toEqual(to)
  })
})

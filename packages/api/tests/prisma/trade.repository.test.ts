import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Trade } from '../../src/common'
import { TradeRepository } from '../../src/prisma/repositories/trade.repository'
import type { PrismaService } from '../../src/prisma/prisma.service'

function makeMockPrisma() {
  return {
    trade: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  } as unknown as PrismaService
}

const domainTrade: Trade = {
  id: 'trade-1',
  coin: 'BTC/USDT',
  side: 'buy',
  size: 200,
  entryPrice: 50000,
  openedAt: new Date('2026-05-05T10:00:00Z'),
}

describe('TradeRepository', () => {
  let prisma: PrismaService
  let repo: TradeRepository

  beforeEach(() => {
    prisma = makeMockPrisma()
    repo = new TradeRepository(prisma)
  })

  it('saveTrade calls prisma.trade.create with mapped fields', async () => {
    const mockCreate = prisma.trade.create as ReturnType<typeof vi.fn>
    mockCreate.mockResolvedValue({ ...domainTrade, source: 'live' })
    await repo.saveTrade(domainTrade)
    expect(mockCreate).toHaveBeenCalledOnce()
    const { data } = mockCreate.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(data['id']).toBe('trade-1')
    expect(data['coin']).toBe('BTC/USDT')
    expect(data['side']).toBe('buy')
    expect(data['size']).toBe(200)
    expect(data['entryPrice']).toBe(50000)
    expect(data['source']).toBe('live')
  })

  it('saveTrade accepts a custom source', async () => {
    const mockCreate = prisma.trade.create as ReturnType<typeof vi.fn>
    mockCreate.mockResolvedValue({ ...domainTrade, source: 'backtest' })
    await repo.saveTrade(domainTrade, 'backtest')
    const { data } = mockCreate.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(data['source']).toBe('backtest')
  })

  it('findRecentTrades calls prisma.trade.findMany with correct limit and order', async () => {
    const mockFindMany = prisma.trade.findMany as ReturnType<typeof vi.fn>
    mockFindMany.mockResolvedValue([])
    await repo.findRecentTrades(10)
    expect(mockFindMany).toHaveBeenCalledOnce()
    const args = mockFindMany.mock.calls[0][0] as Record<string, unknown>
    expect((args['take'] as number)).toBe(10)
    expect((args['orderBy'] as Record<string, string>)['openedAt']).toBe('desc')
  })

  it('findOpenTrades filters by closedAt: null', async () => {
    const mockFindMany = prisma.trade.findMany as ReturnType<typeof vi.fn>
    mockFindMany.mockResolvedValue([])
    await repo.findOpenTrades()
    const args = mockFindMany.mock.calls[0][0] as Record<string, unknown>
    expect((args['where'] as Record<string, unknown>)['closedAt']).toBe(null)
  })
})

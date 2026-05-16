import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Signal } from '@trader/shared'
import { SignalRepository } from '../src/repositories/signal-repository.js'
import type { PrismaClient } from '@prisma/client'

function makeMockPrisma() {
  return {
    signal: { createMany: vi.fn(), findMany: vi.fn() },
  } as unknown as PrismaClient
}

const domainSignal: Signal = {
  source: 'cryptopanic', type: 'news', content: 'BTC breaks $60k',
  timestamp: new Date('2026-05-05T10:00:00Z'), coins: ['BTC/USDT'],
  raw: { url: 'https://example.com' },
}

describe('SignalRepository', () => {
  let prisma: PrismaClient
  let repo: SignalRepository

  beforeEach(() => { prisma = makeMockPrisma(); repo = new SignalRepository(prisma) })

  it('saveSignals calls prisma.signal.createMany with mapped fields', async () => {
    const mockCreateMany = prisma.signal.createMany as ReturnType<typeof vi.fn>
    mockCreateMany.mockResolvedValue({ count: 1 })
    await repo.saveSignals([domainSignal])
    expect(mockCreateMany).toHaveBeenCalledOnce()
    const { data } = mockCreateMany.mock.calls[0][0] as { data: Record<string, unknown>[] }
    expect(data[0]['source']).toBe('cryptopanic')
    expect(data[0]['coins']).toEqual(['BTC/USDT'])
  })

  it('saveSignals stores undefined coins as empty array', async () => {
    const mockCreateMany = prisma.signal.createMany as ReturnType<typeof vi.fn>
    mockCreateMany.mockResolvedValue({ count: 1 })
    await repo.saveSignals([{ ...domainSignal, coins: undefined }])
    const { data } = mockCreateMany.mock.calls[0][0] as { data: Record<string, unknown>[] }
    expect(data[0]['coins']).toEqual([])
  })

  it('saveSignals does nothing when given an empty array', async () => {
    const mockCreateMany = prisma.signal.createMany as ReturnType<typeof vi.fn>
    await repo.saveSignals([])
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it('findSignalsSince calls findMany with correct gte filter', async () => {
    const mockFindMany = prisma.signal.findMany as ReturnType<typeof vi.fn>
    mockFindMany.mockResolvedValue([])
    const from = new Date('2026-05-05T00:00:00Z')
    await repo.findSignalsSince(from)
    const args = mockFindMany.mock.calls[0][0] as Record<string, unknown>
    const where = args['where'] as Record<string, unknown>
    expect((where['timestamp'] as Record<string, Date>)['gte']).toEqual(from)
  })

  it('findSignals returns only signals within [from, to] range', async () => {
    const mockFindMany = prisma.signal.findMany as ReturnType<typeof vi.fn>
    const from = new Date('2026-05-01T00:00:00Z')
    const to = new Date('2026-05-07T00:00:00Z')
    const dbRow = {
      source: domainSignal.source, type: domainSignal.type, content: domainSignal.content,
      timestamp: domainSignal.timestamp, coins: domainSignal.coins ?? [], raw: domainSignal.raw,
    }
    mockFindMany.mockResolvedValue([dbRow])
    const results = await repo.findSignals(from, to)
    const args = mockFindMany.mock.calls[0][0] as Record<string, unknown>
    const where = args['where'] as Record<string, unknown>
    const ts = where['timestamp'] as Record<string, Date>
    expect(ts['gte']).toEqual(from)
    expect(ts['lte']).toEqual(to)
    expect(results).toHaveLength(1)
    expect(results[0]!.source).toBe('cryptopanic')
  })

  it('findSignals includes signals exactly at from and to boundaries', async () => {
    const mockFindMany = prisma.signal.findMany as ReturnType<typeof vi.fn>
    const from = new Date('2026-05-05T10:00:00Z')
    const to = new Date('2026-05-05T10:00:00Z')
    const dbRow = {
      source: domainSignal.source, type: domainSignal.type, content: domainSignal.content,
      timestamp: domainSignal.timestamp, coins: [], raw: null,
    }
    mockFindMany.mockResolvedValue([dbRow])
    const results = await repo.findSignals(from, to)
    const args = mockFindMany.mock.calls[0][0] as Record<string, unknown>
    const where = args['where'] as Record<string, unknown>
    const ts = where['timestamp'] as Record<string, Date>
    expect(ts['gte']).toEqual(from)
    expect(ts['lte']).toEqual(to)
    expect(results).toHaveLength(1)
    expect(results[0]!.coins).toBeUndefined()
  })
})

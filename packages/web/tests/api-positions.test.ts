import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @trader/db before importing the route
vi.mock('@trader/db', () => ({
  tradeRepository: {
    findOpenTrades: vi.fn(),
  },
}))

import { GET } from '../app/api/positions/route'
import { tradeRepository } from '@trader/db'

describe('GET /api/positions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns open trades as JSON with 200', async () => {
    const mockTrades = [
      {
        id: 'trade-1',
        coin: 'BTC/USDT',
        side: 'buy' as const,
        size: 200,
        entryPrice: 50000,
        openedAt: new Date('2025-01-01'),
        reasoning: 'bullish signal',
      },
    ]
    vi.mocked(tradeRepository.findOpenTrades).mockResolvedValue(mockTrades)

    const response = await GET()

    expect(response.status).toBe(200)
    const body = await response.json() as typeof mockTrades
    expect(body).toHaveLength(1)
    expect(body[0].coin).toBe('BTC/USDT')
  })

  it('returns empty array when no open trades', async () => {
    vi.mocked(tradeRepository.findOpenTrades).mockResolvedValue([])

    const response = await GET()

    expect(response.status).toBe(200)
    const body = await response.json() as unknown[]
    expect(body).toEqual([])
  })

  it('returns 500 when repository throws', async () => {
    vi.mocked(tradeRepository.findOpenTrades).mockRejectedValue(new Error('db error'))

    const response = await GET()

    expect(response.status).toBe(500)
  })
})

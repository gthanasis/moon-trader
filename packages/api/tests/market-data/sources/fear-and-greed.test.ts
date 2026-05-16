import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FearAndGreedSource } from '../../../src/market-data/sources/fear-and-greed'

describe('FearAndGreedSource', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a sentiment signal for current data', async () => {
    const mockResponse = {
      data: [{ value: '35', value_classification: 'Fear', timestamp: '1704067200' }],
    }
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const source = new FearAndGreedSource()
    const signals = await source.fetch()

    expect(signals).toHaveLength(1)
    expect(signals[0].type).toBe('sentiment')
    expect(signals[0].source).toBe('fear-and-greed')
    expect(signals[0].content).toContain('35')
    expect(signals[0].content).toContain('Fear')
  })

  it('returns empty array on fetch failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network error'))

    const source = new FearAndGreedSource()
    const signals = await source.fetch()

    expect(signals).toHaveLength(0)
  })

  it('returns historical signals for a date range', async () => {
    const mockResponse = {
      data: [
        { value: '25', value_classification: 'Extreme Fear', timestamp: '1704153600' },
        { value: '40', value_classification: 'Fear', timestamp: '1704067200' },
      ],
    }
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const source = new FearAndGreedSource()
    const from = new Date('2024-01-01')
    const to = new Date('2024-01-02')
    const signals = await source.fetchHistorical(from, to)

    expect(signals).toHaveLength(2)
    expect(signals[0].type).toBe('sentiment')
  })
})

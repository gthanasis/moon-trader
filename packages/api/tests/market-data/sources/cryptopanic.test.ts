import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CryptoPanicSource } from '../../../src/market-data/sources/cryptopanic'

const mockPost = (title: string, currency: string, publishedAt: string) => ({
  title,
  published_at: publishedAt,
  currencies: [{ code: currency }],
  url: 'https://example.com',
})

describe('CryptoPanicSource', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns news signals from the API', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          mockPost('Bitcoin ETF approved', 'BTC', '2024-01-10T12:00:00Z'),
          mockPost('Ethereum upgrade planned', 'ETH', '2024-01-10T11:00:00Z'),
        ],
      }),
    } as Response)

    const source = new CryptoPanicSource({ apiToken: 'test-token' })
    const signals = await source.fetch()

    expect(signals).toHaveLength(2)
    expect(signals[0].type).toBe('news')
    expect(signals[0].source).toBe('cryptopanic')
    expect(signals[0].coins).toContain('BTC/USDT')
    expect(signals[0].content).toContain('Bitcoin ETF approved')
  })

  it('returns empty array on API failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network error'))

    const source = new CryptoPanicSource({ apiToken: 'test-token' })
    const signals = await source.fetch()

    expect(signals).toHaveLength(0)
  })

  it('maps currency codes to coin pairs', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [mockPost('SOL news', 'SOL', '2024-01-10T10:00:00Z')],
      }),
    } as Response)

    const source = new CryptoPanicSource({ apiToken: 'test-token' })
    const signals = await source.fetch()

    expect(signals[0].coins).toContain('SOL/USDT')
  })
})

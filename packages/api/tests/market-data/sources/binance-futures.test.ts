import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BinanceFuturesSource } from '../../../src/market-data/sources/binance-futures'

interface RouteCfg { ok?: boolean; body?: unknown; reject?: boolean }

/** Mocks fetch, routing by endpoint (premiumIndex / openInterest / depth). */
function mockBinance(opts: { funding?: RouteCfg; oi?: RouteCfg; depth?: RouteCfg } = {}) {
  const funding = opts.funding ?? { ok: true, body: { symbol: 'BTCUSDT', lastFundingRate: '0.0001', nextFundingTime: 0, markPrice: '50000' } }
  const oi = opts.oi ?? { ok: true, body: { symbol: 'BTCUSDT', openInterest: '12345.6', time: 1704067200000 } }
  const depth = opts.depth ?? { ok: true, body: { bids: [['100', '8'], ['99', '7']], asks: [['101', '7'], ['102', '5']] } }
  vi.mocked(fetch).mockImplementation(async (url) => {
    const u = String(url)
    const cfg: RouteCfg = u.includes('premiumIndex') ? funding : u.includes('openInterest') ? oi : depth
    if (cfg.reject) throw new Error('network error')
    return { ok: cfg.ok ?? true, json: async () => cfg.body } as Response
  })
}

describe('BinanceFuturesSource', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns funding, open-interest and order-book signals per coin', async () => {
    mockBinance()
    const signals = await new BinanceFuturesSource(['BTC/USDT']).fetch()

    expect(signals).toHaveLength(3)
    expect(signals.every(s => s.type === 'microstructure')).toBe(true)
    expect(signals.every(s => s.source === 'binance-futures')).toBe(true)
    expect(signals.every(s => s.coins?.[0] === 'BTC/USDT')).toBe(true)

    expect(signals.find(s => s.content.includes('funding'))!.content).toContain('0.0100%')
    expect(signals.find(s => s.content.includes('open interest'))!.content).toContain('BTC')
    expect(signals.find(s => s.content.includes('order book'))).toBeDefined()
  })

  it('labels a positive funding rate as longs paying shorts', async () => {
    mockBinance({ funding: { body: { symbol: 'BTCUSDT', lastFundingRate: '0.0005', nextFundingTime: 0, markPrice: '50000' } } })
    const signals = await new BinanceFuturesSource(['BTC/USDT']).fetch()
    expect(signals.find(s => s.content.includes('funding'))!.content).toContain('longs pay shorts')
  })

  it('labels a negative funding rate as shorts paying longs', async () => {
    mockBinance({ funding: { body: { symbol: 'BTCUSDT', lastFundingRate: '-0.0005', nextFundingTime: 0, markPrice: '50000' } } })
    const signals = await new BinanceFuturesSource(['BTC/USDT']).fetch()
    expect(signals.find(s => s.content.includes('funding'))!.content).toContain('shorts pay longs')
  })

  it('classifies a bid-heavy order book as buy pressure', async () => {
    mockBinance({ depth: { body: { bids: [['100', '90']], asks: [['101', '10']] } } })
    const signals = await new BinanceFuturesSource(['BTC/USDT']).fetch()
    const book = signals.find(s => s.content.includes('order book'))!
    expect(book.content).toContain('90.0% bids')
    expect(book.content).toContain('buy pressure')
  })

  it('classifies an ask-heavy order book as sell pressure', async () => {
    mockBinance({ depth: { body: { bids: [['100', '10']], asks: [['101', '90']] } } })
    const signals = await new BinanceFuturesSource(['BTC/USDT']).fetch()
    expect(signals.find(s => s.content.includes('order book'))!.content).toContain('sell pressure')
  })

  it('classifies an even order book as balanced', async () => {
    mockBinance({ depth: { body: { bids: [['100', '50']], asks: [['101', '50']] } } })
    const signals = await new BinanceFuturesSource(['BTC/USDT']).fetch()
    expect(signals.find(s => s.content.includes('order book'))!.content).toContain('balanced')
  })

  it('still returns the other signals when the funding request fails', async () => {
    mockBinance({ funding: { reject: true } })
    const signals = await new BinanceFuturesSource(['BTC/USDT']).fetch()
    expect(signals).toHaveLength(2)
    expect(signals.some(s => s.content.includes('open interest'))).toBe(true)
    expect(signals.some(s => s.content.includes('order book'))).toBe(true)
  })

  it('returns an empty array when every request fails', async () => {
    mockBinance({ funding: { reject: true }, oi: { reject: true }, depth: { reject: true } })
    const signals = await new BinanceFuturesSource(['BTC/USDT']).fetch()
    expect(signals).toHaveLength(0)
  })

  it('drops a coin whose responses are not ok', async () => {
    mockBinance({ funding: { ok: false, body: {} }, oi: { ok: false, body: {} }, depth: { ok: false, body: {} } })
    const signals = await new BinanceFuturesSource(['BTC/USDT']).fetch()
    expect(signals).toHaveLength(0)
  })

  it('fetches every configured coin', async () => {
    mockBinance()
    const signals = await new BinanceFuturesSource(['BTC/USDT', 'ETH/USDT']).fetch()
    expect(signals).toHaveLength(6) // 2 coins × (funding + OI + order book)
  })

  it('returns no historical signals — microstructure is point-in-time', async () => {
    const signals = await new BinanceFuturesSource(['BTC/USDT']).fetchHistorical(new Date(0), new Date())
    expect(signals).toHaveLength(0)
  })
})

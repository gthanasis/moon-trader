import { describe, it, expect, vi } from 'vitest'
import { BinanceSource } from '../../src/sources/binance.js'

type OhlcvRow = [number, number, number, number, number, number]

function makeMockExchange(rows: Record<string, OhlcvRow[]>) {
  return {
    fetchOHLCV: async (symbol: string): Promise<OhlcvRow[]> => rows[symbol] ?? [],
  }
}

function makeRow(ts: number): OhlcvRow {
  return [ts, 1, 2, 0.5, 1.5, 100]
}

describe('BinanceSource', () => {
  it('maps fetchOHLCV rows to Candle objects', async () => {
    const ts = 1704067200000 // 2024-01-01T00:00:00Z
    const exchange = makeMockExchange({
      'BTC/USDT': [[ts, 50000, 51000, 49500, 50500, 1200]],
    })
    const source = new BinanceSource(exchange)

    const ohlcv = await source.fetchOhlcv(['BTC/USDT'], '15m', 100)

    expect(ohlcv['BTC/USDT']).toHaveLength(1)
    const candle = ohlcv['BTC/USDT'][0]
    expect(candle.timestamp).toEqual(new Date(ts))
    expect(candle.open).toBe(50000)
    expect(candle.high).toBe(51000)
    expect(candle.low).toBe(49500)
    expect(candle.close).toBe(50500)
    expect(candle.volume).toBe(1200)
  })

  it('fetches multiple coins in parallel', async () => {
    const exchange = makeMockExchange({
      'BTC/USDT': [[1000, 50000, 50000, 50000, 50000, 1]],
      'ETH/USDT': [[2000, 3000, 3000, 3000, 3000, 2]],
    })
    const source = new BinanceSource(exchange)

    const ohlcv = await source.fetchOhlcv(['BTC/USDT', 'ETH/USDT'], '15m', 10)

    expect(ohlcv['BTC/USDT']).toHaveLength(1)
    expect(ohlcv['ETH/USDT']).toHaveLength(1)
  })

  it('skips coins that fail to fetch (partial failure tolerance)', async () => {
    let calls = 0
    const exchange = {
      fetchOHLCV: async (symbol: string): Promise<OhlcvRow[]> => {
        calls++
        if (symbol === 'ETH/USDT') throw new Error('rate limited')
        return [[1000, 50000, 50000, 50000, 50000, 1]]
      },
    }
    const source = new BinanceSource(exchange)

    const ohlcv = await source.fetchOhlcv(['BTC/USDT', 'ETH/USDT'], '15m', 10)

    expect(ohlcv['BTC/USDT']).toHaveLength(1)
    expect(ohlcv['ETH/USDT']).toBeUndefined()
    expect(calls).toBe(2)
  })

  it('fetch() returns empty signals (price data is in ohlcv, not signals)', async () => {
    const source = new BinanceSource({ fetchOHLCV: async () => [] })
    const signals = await source.fetch()
    expect(signals).toEqual([])
  })

  it('fetchHistorical() returns empty signals', async () => {
    const source = new BinanceSource({ fetchOHLCV: async () => [] })
    const signals = await source.fetchHistorical(new Date(), new Date())
    expect(signals).toEqual([])
  })
})

const HOUR_MS = 3_600_000
const from = new Date('2024-01-01T00:00:00Z')
const to = new Date('2024-01-01T05:00:00Z')

describe('BinanceSource.fetchHistoricalOhlcv', () => {
  it('single page fetch — passes correct since, returns mapped candles', async () => {
    const rows: OhlcvRow[] = [
      makeRow(from.getTime()),
      makeRow(from.getTime() + HOUR_MS),
    ]
    const fetchOHLCV = vi.fn().mockResolvedValue(rows)
    const source = new BinanceSource({ fetchOHLCV })

    const result = await source.fetchHistoricalOhlcv(['BTC/USDT'], '1h', from, to)

    expect(fetchOHLCV).toHaveBeenCalledWith('BTC/USDT', '1h', from.getTime(), 1000)
    expect(result['BTC/USDT']).toHaveLength(2)
    expect(result['BTC/USDT'][0].timestamp).toEqual(new Date(from.getTime()))
    expect(result['BTC/USDT'][0].open).toBe(1)
    expect(result['BTC/USDT'][0].close).toBe(1.5)
  })

  it('multi-page fetch — calls exchange twice when first page is full', async () => {
    const page1: OhlcvRow[] = Array.from({ length: 1000 }, (_, i) =>
      makeRow(from.getTime() + i * 60_000),
    )
    const page2: OhlcvRow[] = [makeRow(from.getTime() + 1000 * 60_000)]
    const fetchOHLCV = vi.fn()
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2)

    const wideTo = new Date(from.getTime() + 2000 * 60_000)
    const source = new BinanceSource({ fetchOHLCV })

    const result = await source.fetchHistoricalOhlcv(['BTC/USDT'], '1m', from, wideTo)

    expect(fetchOHLCV).toHaveBeenCalledTimes(2)
    expect(fetchOHLCV).toHaveBeenNthCalledWith(1, 'BTC/USDT', '1m', from.getTime(), 1000)
    expect(fetchOHLCV).toHaveBeenNthCalledWith(
      2,
      'BTC/USDT',
      '1m',
      from.getTime() + 1000 * 60_000,
      1000,
    )
    expect(result['BTC/USDT']).toHaveLength(1001)
  })

  it('empty first page — returns empty array for that coin', async () => {
    const fetchOHLCV = vi.fn().mockResolvedValue([])
    const source = new BinanceSource({ fetchOHLCV })

    const result = await source.fetchHistoricalOhlcv(['BTC/USDT'], '1h', from, to)

    expect(result['BTC/USDT']).toEqual([])
  })

  it('candles past `to` are filtered out', async () => {
    const rows: OhlcvRow[] = [
      makeRow(to.getTime() - HOUR_MS),
      makeRow(to.getTime()),
      makeRow(to.getTime() + HOUR_MS),
    ]
    const fetchOHLCV = vi.fn().mockResolvedValue(rows)
    const source = new BinanceSource({ fetchOHLCV })

    const result = await source.fetchHistoricalOhlcv(['BTC/USDT'], '1h', from, to)

    expect(result['BTC/USDT']).toHaveLength(2)
    expect(result['BTC/USDT'].every(c => c.timestamp <= to)).toBe(true)
  })
})

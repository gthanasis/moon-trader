import { describe, it, expect } from 'vitest'
import { BinanceSource } from '../../src/sources/binance.js'

type OhlcvRow = [number, number, number, number, number, number]

function makeMockExchange(rows: Record<string, OhlcvRow[]>) {
  return {
    fetchOHLCV: async (symbol: string): Promise<OhlcvRow[]> => rows[symbol] ?? [],
  }
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

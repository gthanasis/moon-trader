import { describe, it, expect } from 'vitest'
import { Pipeline } from '../../src/market-data/pipeline'
import { NullDataSource } from '../../src/market-data/sources/null'
import type { DataSource } from '../../src/market-data/sources/base'
import type { Signal } from '../../src/common'
import type { OhlcvSource } from '../../src/market-data/sources/ohlcv-base'
import type { Candle } from '../../src/common'

function makeCandle(ts: number): Candle {
  return { timestamp: new Date(ts), open: 1, high: 1, low: 1, close: 1, volume: 1 }
}

const makeSource = (id: string, signals: Signal[]): DataSource => ({
  id,
  fetch: async () => signals,
  fetchHistorical: async () => signals,
})

describe('Pipeline', () => {
  it('builds a WorldSnapshot with merged signals from all sources', async () => {
    const s1 = makeSource('source-a', [
      { source: 'source-a', type: 'sentiment', content: 'Fear index: 30', timestamp: new Date() },
    ])
    const s2 = makeSource('source-b', [
      { source: 'source-b', type: 'news', content: 'Bitcoin ETF approved', timestamp: new Date() },
    ])

    const pipeline = new Pipeline({ sources: [s1, s2] })
    const snapshot = await pipeline.fetch()

    expect(snapshot.signals).toHaveLength(2)
    expect(snapshot.signals.map(s => s.source)).toContain('source-a')
    expect(snapshot.signals.map(s => s.source)).toContain('source-b')
  })

  it('returns empty signals when all sources return nothing', async () => {
    const pipeline = new Pipeline({ sources: [new NullDataSource()] })
    const snapshot = await pipeline.fetch()
    expect(snapshot.signals).toHaveLength(0)
  })

  it('continues if one source throws, others succeed', async () => {
    const failing: DataSource = {
      id: 'failing',
      fetch: async () => { throw new Error('network error') },
      fetchHistorical: async () => [],
    }
    const working = makeSource('working', [
      { source: 'working', type: 'macro', content: 'CPI data released', timestamp: new Date() },
    ])

    const pipeline = new Pipeline({ sources: [failing, working] })
    const snapshot = await pipeline.fetch()

    expect(snapshot.signals).toHaveLength(1)
    expect(snapshot.signals[0].source).toBe('working')
  })

  it('sorts signals by timestamp descending', async () => {
    const old = new Date('2024-01-01')
    const recent = new Date('2024-01-02')
    const source = makeSource('s', [
      { source: 's', type: 'news', content: 'old', timestamp: old },
      { source: 's', type: 'news', content: 'recent', timestamp: recent },
    ])

    const pipeline = new Pipeline({ sources: [source] })
    const snapshot = await pipeline.fetch()

    expect(snapshot.signals[0].timestamp).toEqual(recent)
    expect(snapshot.signals[1].timestamp).toEqual(old)
  })
})

describe('Pipeline with ohlcvSource', () => {
  it('populates snapshot.ohlcv from ohlcvSource on fetch()', async () => {
    const ohlcvSource: OhlcvSource = {
      id: 'mock-ohlcv',
      fetchOhlcv: async () => ({ 'BTC/USDT': [makeCandle(1000)] }),
    }
    const pipeline = new Pipeline({
      sources: [],
      ohlcvSource,
      coins: ['BTC/USDT'],
      timeframe: '15m',
      ohlcvLimit: 100,
    })

    const snapshot = await pipeline.fetch()

    expect(snapshot.ohlcv['BTC/USDT']).toHaveLength(1)
    expect(snapshot.ohlcv['BTC/USDT'][0].open).toBe(1)
  })

  it('returns empty ohlcv when no ohlcvSource configured', async () => {
    const pipeline = new Pipeline({ sources: [] })
    const snapshot = await pipeline.fetch()
    expect(snapshot.ohlcv).toEqual({})
  })

  it('returns empty ohlcv when ohlcvSource fetch fails', async () => {
    const ohlcvSource: OhlcvSource = {
      id: 'failing',
      fetchOhlcv: async () => { throw new Error('network error') },
    }
    const pipeline = new Pipeline({
      sources: [],
      ohlcvSource,
      coins: ['BTC/USDT'],
      timeframe: '15m',
      ohlcvLimit: 100,
    })

    const snapshot = await pipeline.fetch()
    expect(snapshot.ohlcv).toEqual({})
  })

  it('fetchHistorical returns empty ohlcv regardless of ohlcvSource', async () => {
    const ohlcvSource: OhlcvSource = {
      id: 'mock-ohlcv',
      fetchOhlcv: async () => ({ 'BTC/USDT': [makeCandle(1000)] }),
    }
    const pipeline = new Pipeline({
      sources: [],
      ohlcvSource,
      coins: ['BTC/USDT'],
      timeframe: '15m',
      ohlcvLimit: 100,
    })

    const snapshot = await pipeline.fetchHistorical(new Date(0), new Date())
    expect(snapshot.ohlcv).toEqual({})
  })
})

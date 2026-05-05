import { describe, it, expect } from 'vitest'
import { historicalSlice } from '../src/historical-slice.js'
import type { Signal, Candle } from '@trader/shared'

function makeSignal(source: string, timestamp: Date): Signal {
  return { source, type: 'news', content: 'test', timestamp }
}

function makeCandle(timestamp: Date, close = 100): Candle {
  return { timestamp, open: close, high: close, low: close, close, volume: 1 }
}

const t0 = new Date('2024-01-01T00:00:00Z')
const t1 = new Date('2024-01-01T01:00:00Z')
const t2 = new Date('2024-01-01T02:00:00Z')
const t3 = new Date('2024-01-01T03:00:00Z')

describe('historicalSlice', () => {
  it('includes only signals at or before currentTime', () => {
    const signals: Signal[] = [
      makeSignal('a', t0),
      makeSignal('b', t1),
      makeSignal('c', t3),
    ]
    const ohlcv = { BTC: [makeCandle(t0), makeCandle(t1), makeCandle(t3)] }

    const snapshot = historicalSlice(signals, ohlcv, t2)

    expect(snapshot.signals).toHaveLength(2)
    expect(snapshot.signals.map(s => s.source)).toEqual(expect.arrayContaining(['a', 'b']))
    expect(snapshot.signals.find(s => s.source === 'c')).toBeUndefined()
  })

  it('includes only candles with timestamp before currentTime (strict no-lookahead)', () => {
    const signals: Signal[] = []
    const ohlcv = {
      BTC: [makeCandle(t0), makeCandle(t1), makeCandle(t2), makeCandle(t3)],
    }

    const snapshot = historicalSlice(signals, ohlcv, t2)

    // candles AT currentTime are future data — exclude them
    expect(snapshot.ohlcv['BTC']).toHaveLength(2)
    expect(snapshot.ohlcv['BTC'].map(c => c.timestamp)).toEqual([t0, t1])
  })

  it('sets snapshot timestamp to currentTime', () => {
    const snapshot = historicalSlice([], {}, t1)
    expect(snapshot.timestamp).toEqual(t1)
  })

  it('returns empty signals and empty ohlcv when nothing is before currentTime', () => {
    const signals = [makeSignal('future', t3)]
    const ohlcv = { BTC: [makeCandle(t3)] }

    const snapshot = historicalSlice(signals, ohlcv, t0)

    expect(snapshot.signals).toHaveLength(0)
    expect(snapshot.ohlcv['BTC']).toHaveLength(0)
  })

  it('handles multiple coins independently', () => {
    const signals: Signal[] = []
    const ohlcv = {
      BTC: [makeCandle(t0), makeCandle(t3)],
      ETH: [makeCandle(t1), makeCandle(t3)],
    }

    const snapshot = historicalSlice(signals, ohlcv, t2)

    expect(snapshot.ohlcv['BTC']).toHaveLength(1)
    expect(snapshot.ohlcv['ETH']).toHaveLength(1)
  })
})

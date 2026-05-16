import { describe, it, expect } from 'vitest'
import { getFillPrice } from '../src/fill-simulator.js'
import type { Candle } from '@trader/shared'

function makeCandle(timestamp: Date, open: number): Candle {
  return { timestamp, open, high: open, low: open, close: open, volume: 1 }
}

const t0 = new Date('2024-01-01T00:00:00Z')
const t1 = new Date('2024-01-01T01:00:00Z')
const t2 = new Date('2024-01-01T02:00:00Z')
const t3 = new Date('2024-01-01T03:00:00Z')

describe('getFillPrice', () => {
  it('returns the open price of the first candle strictly after afterTime', () => {
    const candles: Candle[] = [
      makeCandle(t0, 100),
      makeCandle(t1, 105),
      makeCandle(t2, 110),
    ]

    const price = getFillPrice(candles, t0)

    expect(price).toBe(105)
  })

  it('returns undefined when no candle exists after afterTime', () => {
    const candles: Candle[] = [makeCandle(t0, 100), makeCandle(t1, 105)]

    const price = getFillPrice(candles, t1)

    expect(price).toBeUndefined()
  })

  it('returns undefined for empty candle array', () => {
    const price = getFillPrice([], t0)
    expect(price).toBeUndefined()
  })

  it('returns the first candle open when afterTime is before all candles', () => {
    const candles: Candle[] = [makeCandle(t1, 200), makeCandle(t2, 210)]

    const price = getFillPrice(candles, t0)

    expect(price).toBe(200)
  })

  it('uses strictly after (not equal) comparison', () => {
    const candles: Candle[] = [makeCandle(t1, 150), makeCandle(t2, 160)]

    // exactly at t1 — should return t2's open, not t1's
    const price = getFillPrice(candles, t1)

    expect(price).toBe(160)
  })

  it('returns undefined when gap to next candle exceeds 2× expectedIntervalMs', () => {
    const intervalMs = 60 * 60 * 1000 // 1h
    // next candle is 3h after afterTime (> 2× interval)
    const afterTime = t0
    const nextCandle = makeCandle(t3, 200) // t3 = t0 + 3h

    const price = getFillPrice([nextCandle], afterTime, intervalMs)

    expect(price).toBeUndefined()
  })

  it('returns price when gap to next candle is within 2× expectedIntervalMs', () => {
    const intervalMs = 60 * 60 * 1000 // 1h
    // next candle is 1h after afterTime (= 1× interval, within 2×)
    const afterTime = t0
    const nextCandle = makeCandle(t1, 200) // t1 = t0 + 1h

    const price = getFillPrice([nextCandle], afterTime, intervalMs)

    expect(price).toBe(200)
  })
})

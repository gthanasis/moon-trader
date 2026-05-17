import { describe, it, expect } from 'vitest'
import { computeFeatures } from '../../src/llm/features'
import type { Candle } from '../../src/common'

/** A flat-OHLC candle (open=high=low=close) at minute `i`, for deterministic math. */
function flatCandle(i: number, close: number, volume = 1000): Candle {
  return {
    timestamp: new Date(2026, 0, 1, 0, i),
    open: close,
    high: close,
    low: close,
    close,
    volume,
  }
}

/** A series of `n` flat candles whose close is produced by `closeAt(i)`. */
function series(n: number, closeAt: (i: number) => number, volAt: (i: number) => number = () => 1000): Candle[] {
  return Array.from({ length: n }, (_, i) => flatCandle(i, closeAt(i), volAt(i)))
}

describe('computeFeatures', () => {
  it('returns null for fewer than 2 candles', () => {
    expect(computeFeatures([])).toBeNull()
    expect(computeFeatures([flatCandle(0, 100)])).toBeNull()
  })

  it('computes a feature set once there are at least 2 candles', () => {
    const f = computeFeatures(series(2, i => 100 + i))
    expect(f).not.toBeNull()
  })

  it('reads a strictly rising series as bullish with positive returns', () => {
    // closes 100..159 — every step +1.
    const f = computeFeatures(series(60, i => 100 + i))!
    expect(f.trend).toBe('bullish')
    expect(f.ema20Distance).toBeGreaterThan(0) // lagging EMA sits below price
    expect(f.ema50Distance).toBeGreaterThan(0)
    expect(f.windowReturn).toBeCloseTo(59, 5) // (159-100)/100*100
    expect(f.rsi14).toBe(100) // 14 consecutive gains, no losses
  })

  it('reads a strictly falling series as bearish with negative returns', () => {
    // closes 159..100 — every step -1.
    const f = computeFeatures(series(60, i => 159 - i))!
    expect(f.trend).toBe('bearish')
    expect(f.ema20Distance).toBeLessThan(0)
    expect(f.windowReturn).toBeCloseTo(((100 - 159) / 159) * 100, 5)
    expect(f.rsi14).toBe(0) // 14 consecutive losses, no gains
  })

  it('computes ATR as the mean true range of flat-OHLC candles', () => {
    // Each step moves close by 1, OHLC flat → true range = 1 every bar → ATR 1.
    const f = computeFeatures(series(60, i => 100 + i))!
    expect(f.atr14).toBeCloseTo(1, 5)
  })

  it('returns a zero volume z-score when volume is constant', () => {
    const f = computeFeatures(series(60, i => 100 + i, () => 1000))!
    expect(f.volumeZScore).toBe(0)
  })

  it('returns a positive volume z-score on a volume spike in the latest bar', () => {
    const f = computeFeatures(series(60, i => 100 + i, i => (i === 59 ? 9000 : 1000)))!
    expect(f.volumeZScore).toBeGreaterThan(0)
  })

  it('reports zero window return for a flat price series', () => {
    const f = computeFeatures(series(60, () => 100))!
    expect(f.windowReturn).toBe(0)
    expect(f.realisedVol).toBe(0)
  })

  it('is pure — calling twice on the same input yields equal results', () => {
    const candles = series(40, i => 100 + Math.sin(i))
    expect(computeFeatures(candles)).toEqual(computeFeatures(candles))
  })
})

import { describe, it, expect } from 'vitest'
import { classifyRegime } from '../../src/llm/regime'
import type { FeatureSet } from '../../src/common'

/** A neutral, healthy-uptrend feature set; tests override the relevant fields. */
function features(overrides: Partial<FeatureSet> = {}): FeatureSet {
  return {
    rsi14: 55,
    atr14: 100,
    realisedVol: 0.4,
    ema20Distance: 1.5,
    ema50Distance: 3,
    trend: 'bullish',
    volumeZScore: 0,
    windowReturn: 3,
    ...overrides,
  }
}

describe('classifyRegime', () => {
  it('reads a healthy bullish set as trending-up', () => {
    expect(classifyRegime(features(), null)).toBe('trending-up')
  })

  it('reads a bearish set below EMA20 as trending-down', () => {
    const f = features({ trend: 'bearish', ema20Distance: -2, ema50Distance: -3, rsi14: 40, windowReturn: -3 })
    expect(classifyRegime(f, null)).toBe('trending-down')
  })

  it('reads a sharp coin-specific drop as crashing', () => {
    expect(classifyRegime(features({ windowReturn: -12 }), null)).toBe('crashing')
  })

  it('reads any coin as crashing when BTC is crashing market-wide', () => {
    const coin = features({ windowReturn: 1 }) // coin itself looks calm
    const btc = features({ windowReturn: -9, trend: 'bearish' })
    expect(classifyRegime(coin, btc)).toBe('crashing')
  })

  it('reads a bounce off lows (bearish structure, positive momentum) as recovering', () => {
    const f = features({ trend: 'bearish', ema20Distance: 0.5, rsi14: 52, windowReturn: 5 })
    expect(classifyRegime(f, null)).toBe('recovering')
  })

  it('reads a directionless set as choppy', () => {
    // Bullish EMA cross but price has slipped below EMA20 — no clean trend.
    const f = features({ trend: 'bullish', ema20Distance: -0.3, rsi14: 50, windowReturn: 0.5 })
    expect(classifyRegime(f, null)).toBe('choppy')
  })

  it('treats an overbought bullish set as choppy, not trending-up', () => {
    // RSI above the healthy band — extended, not a clean trend to add to.
    expect(classifyRegime(features({ rsi14: 88 }), null)).toBe('choppy')
  })

  it('lets a crash override an otherwise-bullish set', () => {
    const f = features({ trend: 'bullish', ema20Distance: 2, windowReturn: -15 })
    expect(classifyRegime(f, null)).toBe('crashing')
  })

  it('does not crash on a mild BTC dip', () => {
    const btc = features({ windowReturn: -3, trend: 'bearish' })
    expect(classifyRegime(features(), btc)).toBe('trending-up')
  })

  it('handles a null BTC context', () => {
    expect(classifyRegime(features(), null)).toBe('trending-up')
  })
})

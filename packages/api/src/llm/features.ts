import type { Candle, FeatureSet } from '../common'

/** Exponential moving average over `period`, seeded with the first value. */
export function ema(values: number[], period: number): number {
  if (values.length === 0) return 0
  const k = 2 / (period + 1)
  let result = values[0]
  for (let i = 1; i < values.length; i++) result = values[i] * k + result * (1 - k)
  return result
}

/** Relative Strength Index over `period` (0–100). Returns 50 with too little data. */
export function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50
  let gains = 0, losses = 0
  for (let i = closes.length - period; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1]
    if (delta > 0) gains += delta
    else losses -= delta
  }
  if (losses === 0) return 100
  const rs = gains / losses
  return 100 - 100 / (1 + rs)
}

/** Average True Range over `period`, in price units. */
export function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0
  const trs: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], prev = candles[i - 1]
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)))
  }
  const slice = trs.slice(-period)
  return slice.reduce((a, b) => a + b, 0) / slice.length
}

/** Annualised realised volatility as a fraction (0.5 = 50%). Timeframe-agnostic. */
export function realisedVol(candles: Candle[], period = 20): number {
  if (candles.length < period + 1) return 0
  const slice = candles.slice(-period - 1)
  const closes = slice.map(c => c.close)
  const logReturns = closes.slice(1).map((c, i) => Math.log(c / closes[i]))
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length
  const variance = logReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (logReturns.length - 1)
  // Derive bar length from adjacent timestamps so annualisation is timeframe-agnostic.
  const barMs = candles[candles.length - 1].timestamp.getTime() - candles[candles.length - 2].timestamp.getTime()
  const barsPerYear = (365.25 * 24 * 3600 * 1000) / Math.max(barMs, 1)
  return Math.sqrt(variance * barsPerYear)
}

/** Z-score of the latest volume vs the trailing `period`-bar mean. */
export function volZScore(volumes: number[], period = 20): number {
  if (volumes.length < period + 1) return 0
  const slice = volumes.slice(-period)
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length
  const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length)
  if (std === 0) return 0
  return (volumes[volumes.length - 1] - mean) / std
}

/**
 * Computes the deterministic technical feature set for a coin from its recent
 * candles. Returns `null` when there is too little data (fewer than 2 candles),
 * mirroring the old "insufficient data" indicator string.
 */
export function computeFeatures(candles: Candle[]): FeatureSet | null {
  if (candles.length < 2) return null

  const closes = candles.map(c => c.close)
  const volumes = candles.map(c => c.volume)
  const firstClose = closes[0]
  const lastClose = closes[closes.length - 1]

  const ema20 = ema(closes, 20)
  const ema50 = ema(closes, 50)

  return {
    rsi14: rsi(closes),
    atr14: atr(candles),
    realisedVol: realisedVol(candles),
    ema20Distance: ema20 !== 0 ? ((lastClose - ema20) / ema20) * 100 : 0,
    ema50Distance: ema50 !== 0 ? ((lastClose - ema50) / ema50) * 100 : 0,
    trend: ema20 > ema50 ? 'bullish' : 'bearish',
    volumeZScore: volZScore(volumes),
    windowReturn: firstClose !== 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0,
  }
}

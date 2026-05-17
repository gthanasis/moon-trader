/**
 * Deterministic technical features computed from a coin's recent candles.
 *
 * Computed once per coin per cycle by `computeFeatures` and (a) rendered into
 * the LLM prompt via the `{features}` placeholder and (b) snapshotted onto the
 * `LlmDecision` row, so later regime/calibration analysis is grounded in the
 * exact numbers the bot saw when it decided.
 */
export interface FeatureSet {
  /** Relative Strength Index over 14 periods (0–100). */
  rsi14: number
  /** Average True Range over 14 periods, in price units. */
  atr14: number
  /** Annualised realised volatility as a fraction (0.5 = 50%). */
  realisedVol: number
  /** Percent distance of the last close from EMA20 (positive = above). */
  ema20Distance: number
  /** Percent distance of the last close from EMA50 (positive = above). */
  ema50Distance: number
  /** Trend read from EMA structure: bullish when EMA20 > EMA50. */
  trend: 'bullish' | 'bearish'
  /** Z-score of the latest volume vs the trailing 20-period mean. */
  volumeZScore: number
  /** Percent change from the first to the last candle in the window. */
  windowReturn: number
}

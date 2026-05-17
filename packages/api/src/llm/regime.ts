import type { FeatureSet, Regime } from '../common'

/** Window drop (%) at or below which a coin is treated as crashing. */
const CRASH_RETURN = -8
/** BTC window drop (%) that drags the whole market into a crash regime. */
const BTC_CRASH_RETURN = -6
/** Positive window move (%) that marks a bounce off lows. */
const RECOVERY_RETURN = 2
/** RSI band treated as healthy momentum (not weak, not blow-off overbought). */
const TREND_RSI_MIN = 45
const TREND_RSI_MAX = 80

/**
 * Classifies a coin's market regime deterministically from its feature set,
 * using BTC's features as market-wide context. Checks run most-severe first:
 * a crash overrides everything, then a recovery bounce, then clean trends,
 * with `choppy` as the catch-all for no clear direction.
 */
export function classifyRegime(features: FeatureSet, btcFeatures: FeatureSet | null): Regime {
  // A sharp coin-specific drop, or a market-wide drop led by BTC.
  if (features.windowReturn <= CRASH_RETURN || (btcFeatures !== null && btcFeatures.windowReturn <= BTC_CRASH_RETURN)) {
    return 'crashing'
  }

  // Bounce off lows: structure is still bearish but momentum has turned up.
  if (features.trend === 'bearish' && features.windowReturn >= RECOVERY_RETURN && features.rsi14 >= TREND_RSI_MIN) {
    return 'recovering'
  }

  // Healthy uptrend: bullish EMA structure, price above EMA20, RSI not extreme.
  if (
    features.trend === 'bullish' &&
    features.ema20Distance > 0 &&
    features.rsi14 >= TREND_RSI_MIN &&
    features.rsi14 <= TREND_RSI_MAX
  ) {
    return 'trending-up'
  }

  // Established downtrend: bearish structure with price below EMA20.
  if (features.trend === 'bearish' && features.ema20Distance < 0) {
    return 'trending-down'
  }

  // No clear direction.
  return 'choppy'
}

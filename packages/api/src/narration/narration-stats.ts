import type { Trade, NarrationStats } from '../common'

/** Default reference capital for the alpha calculation when none is supplied. */
const DEFAULT_REFERENCE_CAPITAL = 1000

/**
 * Adds `winRate` and benchmark-relative `alpha` to a raw stats core. Alpha is
 * the bot's return (PnL as a % of reference capital) minus the buy-and-hold
 * BTC benchmark — so a flat period during a BTC rally scores negative.
 */
function finalise(
  core: { pnl: number; trades: number; wins: number; losses: number },
  benchmarkReturn: number,
  referenceCapital: number,
): NarrationStats {
  const winRate = core.trades > 0 ? core.wins / core.trades : 0
  const botReturn = referenceCapital > 0 ? (core.pnl / referenceCapital) * 100 : 0
  return { ...core, winRate, benchmarkReturn, alpha: botReturn - benchmarkReturn }
}

/**
 * Sums child-period stats into a parent-period total. Used by roll-ups, where
 * a week's stats are the sum of its days'. `benchmarkReturn` is recomputed for
 * the whole period by the caller rather than summed (returns do not add).
 */
export function aggregateStats(
  parts: NarrationStats[],
  benchmarkReturn = 0,
  referenceCapital = DEFAULT_REFERENCE_CAPITAL,
): NarrationStats {
  return finalise(
    {
      pnl: parts.reduce((s, p) => s + p.pnl, 0),
      trades: parts.reduce((s, p) => s + p.trades, 0),
      wins: parts.reduce((s, p) => s + p.wins, 0),
      losses: parts.reduce((s, p) => s + p.losses, 0),
    },
    benchmarkReturn,
    referenceCapital,
  )
}

/**
 * Aggregates realised stats from the trades closed in a period. A trade counts
 * toward a period when its `closedAt` falls in that period.
 */
export function computeStats(
  closedTrades: Trade[],
  benchmarkReturn = 0,
  referenceCapital = DEFAULT_REFERENCE_CAPITAL,
): NarrationStats {
  return finalise(
    {
      pnl: closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0),
      trades: closedTrades.length,
      wins: closedTrades.filter(t => (t.pnl ?? 0) > 0).length,
      losses: closedTrades.filter(t => (t.pnl ?? 0) < 0).length,
    },
    benchmarkReturn,
    referenceCapital,
  )
}

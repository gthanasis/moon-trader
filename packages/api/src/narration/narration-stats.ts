import type { Trade, NarrationStats } from '../common'

/**
 * Aggregates realised stats from the trades closed in a period. A trade counts
 * toward a period when its `closedAt` falls in that period.
 */
export function computeStats(closedTrades: Trade[]): NarrationStats {
  const pnl = closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0)
  const wins = closedTrades.filter(t => (t.pnl ?? 0) > 0).length
  const losses = closedTrades.filter(t => (t.pnl ?? 0) < 0).length
  const trades = closedTrades.length
  return {
    pnl,
    trades,
    wins,
    losses,
    winRate: trades > 0 ? wins / trades : 0,
  }
}

import type { Trade, NarrationStats } from '../common'

/**
 * Sums child-period stats into a parent-period total. Used by roll-ups, where
 * a week's stats are the sum of its days' stats.
 */
export function aggregateStats(parts: NarrationStats[]): NarrationStats {
  const pnl = parts.reduce((s, p) => s + p.pnl, 0)
  const trades = parts.reduce((s, p) => s + p.trades, 0)
  const wins = parts.reduce((s, p) => s + p.wins, 0)
  const losses = parts.reduce((s, p) => s + p.losses, 0)
  return { pnl, trades, wins, losses, winRate: trades > 0 ? wins / trades : 0 }
}

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

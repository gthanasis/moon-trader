import type { BacktestTrade, BacktestStats, PnlPoint } from './types.js'

export function calculateStats(
  trades: BacktestTrade[],
  initialCapital: number,
  pnlCurve: PnlPoint[],
): BacktestStats {
  const totalPnl = trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0)

  const closedTrades = trades.filter(t => t.closedAt !== undefined)
  const winningTrades = trades.filter(t => (t.pnl ?? 0) > 0)
  const winRate = trades.length === 0 ? 0 : winningTrades.length / trades.length

  const maxDrawdown = computeMaxDrawdown(pnlCurve)

  const avgHoldTimeMs =
    closedTrades.length === 0
      ? 0
      : closedTrades.reduce((sum, t) => sum + (t.closedAt!.getTime() - t.openedAt.getTime()), 0) /
        closedTrades.length

  const sharpeRatio = computeSharpe(pnlCurve, initialCapital)

  return {
    totalPnl,
    winRate,
    maxDrawdown,
    sharpeRatio,
    avgHoldTimeMs,
    totalTrades: trades.length,
  }
}

function computeMaxDrawdown(curve: PnlPoint[]): number {
  let peak = -Infinity
  let maxDD = 0
  for (const point of curve) {
    if (point.capital > peak) peak = point.capital
    const dd = peak - point.capital
    if (dd > maxDD) maxDD = dd
  }
  return maxDD
}

function computeSharpe(curve: PnlPoint[], initialCapital: number): number {
  if (curve.length < 2) return 0
  const returns: number[] = []
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1].capital
    if (prev === 0) continue
    returns.push((curve[i].capital - prev) / prev)
  }
  if (returns.length === 0) return 0
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length
  const stdDev = Math.sqrt(variance)
  if (stdDev === 0) return 0
  return (mean / stdDev) * Math.sqrt(252)
}

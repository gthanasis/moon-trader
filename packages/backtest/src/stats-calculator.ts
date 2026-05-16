import type { BacktestTrade, BacktestStats, PnlPoint } from './types.js'

export function calculateStats(
  trades: BacktestTrade[],
  initialCapital: number,
  pnlCurve: PnlPoint[],
  intervalMs: number = 60 * 60 * 1000,
): BacktestStats {
  const totalPnl = trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0)
  const totalFees = trades.reduce((sum, t) => sum + (t.fees ?? 0), 0)

  const closedTrades = trades.filter(t => t.closedAt !== undefined)
  // Breakeven trades (pnl === 0) count as losses in the win rate denominator.
  const winningTrades = closedTrades.filter(t => (t.pnl ?? 0) > 0)
  const losingTrades = closedTrades.filter(t => (t.pnl ?? 0) <= 0)
  const winRate = closedTrades.length === 0 ? 0 : winningTrades.length / closedTrades.length

  const avgWin = winningTrades.length === 0
    ? 0
    : winningTrades.reduce((s, t) => s + (t.pnl ?? 0), 0) / winningTrades.length
  const avgLoss = losingTrades.length === 0
    ? 0
    : losingTrades.reduce((s, t) => s + (t.pnl ?? 0), 0) / losingTrades.length

  const grossProfit = winningTrades.reduce((s, t) => s + (t.pnl ?? 0), 0)
  const grossLoss = Math.abs(losingTrades.reduce((s, t) => s + (t.pnl ?? 0), 0))
  const profitFactor = grossLoss === 0 ? 0 : grossProfit / grossLoss

  const maxDrawdown = computeMaxDrawdown(pnlCurve)
  const sharpeRatio = computeSharpe(pnlCurve, intervalMs)
  const calmarRatio = computeCalmar(totalPnl, initialCapital, pnlCurve, intervalMs, maxDrawdown)

  const avgHoldTimeMs =
    closedTrades.length === 0
      ? 0
      : closedTrades.reduce((sum, t) => sum + (t.closedAt!.getTime() - t.openedAt.getTime()), 0) /
        closedTrades.length

  return {
    initialCapital,
    totalPnl,
    totalFees,
    winRate,
    maxDrawdown,
    sharpeRatio,
    calmarRatio,
    profitFactor,
    avgWin,
    avgLoss,
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

function computeCalmar(
  totalPnl: number,
  initialCapital: number,
  curve: PnlPoint[],
  intervalMs: number,
  maxDrawdown: number,
): number {
  if (maxDrawdown === 0 || curve.length < 2) return 0
  const totalMs = curve[curve.length - 1].timestamp.getTime() - curve[0].timestamp.getTime()
  const yearsElapsed = totalMs / (365 * 24 * 60 * 60 * 1000)
  if (yearsElapsed === 0) return 0
  const annualizedReturn = (totalPnl / initialCapital) / yearsElapsed
  return annualizedReturn / (maxDrawdown / initialCapital)
}

function computeSharpe(curve: PnlPoint[], intervalMs: number): number {
  if (curve.length < 2) return 0
  const returns: number[] = []
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1].capital
    if (prev === 0) continue
    returns.push((curve[i].capital - prev) / prev)
  }
  if (returns.length < 2) return 0
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1)
  const stdDev = Math.sqrt(variance)
  if (stdDev === 0) return 0
  const periodsPerYear = (365 * 24 * 60 * 60 * 1000) / intervalMs
  return (mean / stdDev) * Math.sqrt(periodsPerYear)
}

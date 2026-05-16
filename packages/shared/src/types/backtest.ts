export interface BacktestStats {
  initialCapital: number
  totalPnl: number
  totalFees: number
  winRate: number
  maxDrawdown: number
  sharpeRatio: number
  /** Annualized return divided by max drawdown. 0 if maxDrawdown is 0. */
  calmarRatio: number
  /** Gross profit divided by gross loss. 0 if no losing trades. */
  profitFactor: number
  avgWin: number
  avgLoss: number
  avgHoldTimeMs: number
  totalTrades: number
}

export interface BacktestTrade {
  coin: string
  /** Always 'buy' — trades represent the opening leg; exitPrice/closedAt/pnl are set in-place on close. */
  side: 'buy' | 'sell'
  /** Dollar amount invested (not units). units = size / entryPrice. */
  size: number
  entryPrice: number
  exitPrice?: number
  openedAt: Date
  closedAt?: Date
  pnl?: number
  /** Total fees paid (entry + exit). */
  fees: number
  stopLoss?: number
  takeProfit?: number
  reasoning: string
}

export interface PnlPoint {
  timestamp: Date
  capital: number
}

export interface BacktestResult {
  trades: BacktestTrade[]
  stats: BacktestStats
  pnlCurve: PnlPoint[]
}

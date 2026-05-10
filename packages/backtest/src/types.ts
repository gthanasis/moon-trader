import type { Candle, LLMDecision } from '@trader/shared'
import type { LLMAdapter } from '@trader/llm'
import type { DataSource } from '@trader/data'

export interface BacktestConfig {
  from: Date
  to: Date
  initialCapital: number
  autoTradeLimit: number
  coins: string[]
  sources: DataSource[]
  ohlcv: Record<string, Candle[]>
  adapter: LLMAdapter
  intervalMs?: number
  /** Taker fee rate as a decimal. Default: 0.001 (0.1%, Binance taker). */
  feeRate?: number
  /** Slippage in basis points applied to fill price. Default: 5 (0.05%). */
  slippageBps?: number
  /** Fraction of capital risked per trade when a stop-loss is provided. Default: 0.01 (1%). */
  riskPerTradePct?: number
  /** Minimum LLM confidence for a buy to execute. Default: 0.6. */
  minConfidence?: number
  /** Maximum simultaneous open positions. Default: 5. */
  maxPositions?: number
  /** Fraction of day-start equity that may be lost before new buys are blocked. Default: 0.05 (5%). */
  dailyLossLimitPct?: number
  /**
   * Number of bars to skip at the start before the first LLM call, giving long-window indicators
   * (EMA-50, ATR-14, RSI-14) time to warm up. Default: 0 (no skip). Set to 50 for production runs.
   */
  warmupBars?: number
  onStep?: (step: number, total: number, timestamp: Date, decision: LLMDecision) => void | Promise<void>
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
  /** Stop-loss price level set at entry. Position is closed if price drops to or below this. */
  stopLoss?: number
  /** Take-profit price level set at entry. Position is closed if price rises to or above this. */
  takeProfit?: number
  reasoning: string
}

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

export interface PnlPoint {
  timestamp: Date
  capital: number
}

export interface BacktestResult {
  trades: BacktestTrade[]
  stats: BacktestStats
  pnlCurve: PnlPoint[]
}

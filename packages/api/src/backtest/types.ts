import type { Candle } from '../common'
import type { LLMAdapter, CycleResult } from '../llm'
import type { DataSource } from '../market-data'

export type { BacktestStats, BacktestTrade, PnlPoint, BacktestResult } from '../common'

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
  /** Maximum fraction of available capital in a single position. Default: 0.25 (25%). */
  maxSinglePositionPct?: number
  /** Fraction of day-start equity that may be lost before new buys are blocked. Default: 0.05 (5%). */
  dailyLossLimitPct?: number
  /** Trailing stop percentage below the high-water mark. Default: 0.10 (10%). */
  trailingStopPct?: number
  /**
   * Number of bars to skip at the start before the first LLM call, giving long-window indicators
   * (EMA-50, ATR-14, RSI-14) time to warm up. Default: 0 (no skip). Set to 50 for production runs.
   */
  warmupBars?: number
  onStep?: (step: number, total: number, timestamp: Date, cycleResult: CycleResult) => void | Promise<void>
}

import type { Candle } from '@trader/shared'
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
}

export interface BacktestTrade {
  coin: string
  side: 'buy' | 'sell'
  size: number
  entryPrice: number
  exitPrice?: number
  openedAt: Date
  closedAt?: Date
  pnl?: number
  reasoning: string
}

export interface BacktestStats {
  totalPnl: number
  winRate: number
  maxDrawdown: number
  sharpeRatio: number
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

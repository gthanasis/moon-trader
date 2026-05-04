import type { WorldSnapshot } from './signal.js'
import type { Position, Trade, Order } from './trade.js'

export interface LLMDecision {
  action: 'buy' | 'sell' | 'hold'
  coin: string
  size: number
  confidence: number
  reasoning: string
  stopLoss?: number
  takeProfit?: number
}

export interface TradingContext {
  snapshot: WorldSnapshot
  positions: Position[]
  availableCapital: number
  recentTrades: Trade[]
  openOrders: Order[]
}

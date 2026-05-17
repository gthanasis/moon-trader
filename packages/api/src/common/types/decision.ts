import type { WorldSnapshot } from './signal'
import type { Position, Trade, Order } from './trade'
import type { NarrationGranularity } from './narration'
import type { Lesson } from './lesson'

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
  /**
   * User-editable prompt strings, supplied by the trading loop from runtime
   * settings. When absent, prompt-builder falls back to its defaults.
   */
  promptOverrides?: { strategyPrompt: string; promptTemplate: string }
  /**
   * The bot's own most-recent narration recap per time window, used by the
   * `{narration6h|Day|Week|Month}` placeholders. Absent windows render as a
   * "no recap" line.
   */
  narrations?: Partial<Record<NarrationGranularity, string>>
  /**
   * Active lessons from the post-mortem critic, fed back to steer decisions
   * via the `{lessons}` placeholder.
   */
  lessons?: Lesson[]
}

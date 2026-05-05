import type { LLMDecision, TradingContext, WorldSnapshot, Position, Order } from '@trader/shared'
import type { LLMAdapter } from './adapters/base.js'

interface PipelineLike {
  fetch(): Promise<WorldSnapshot>
}

interface EngineLike {
  execute(decision: LLMDecision): Promise<{ executed: boolean; reason?: string; order?: { fillPrice?: number } }>
  updatePositionPrice(coin: string, price: number): void
  getPositions(): Position[]
  getOpenOrders(): Order[]
  availableCapital(): number
}

export interface NotifierLike {
  tradeExecuted(trade: {
    coin: string
    side: 'buy' | 'sell'
    size: number
    fillPrice: number
    reasoning: string
  }): Promise<void>
}

export interface EvaluationCycleConfig {
  pipeline: PipelineLike
  adapter: LLMAdapter
  engine: EngineLike
  autoTradeLimit: number
  onApprovalNeeded?: (decision: LLMDecision) => Promise<boolean>
  notifier?: NotifierLike
}

export interface CycleResult {
  decision: LLMDecision
  executed: boolean
  reason?: string
}

export class EvaluationCycle {
  private readonly config: EvaluationCycleConfig

  constructor(config: EvaluationCycleConfig) {
    this.config = config
  }

  async run(): Promise<CycleResult> {
    const { pipeline, adapter, engine, autoTradeLimit, onApprovalNeeded, notifier } = this.config

    const snapshot = await pipeline.fetch()
    const context: TradingContext = {
      snapshot,
      positions: engine.getPositions(),
      availableCapital: engine.availableCapital(),
      recentTrades: [],
      openOrders: engine.getOpenOrders(),
    }

    // Update position prices from latest candle closes
    for (const [coin, candles] of Object.entries(snapshot.ohlcv)) {
      const lastCandle = candles[candles.length - 1]
      if (lastCandle) {
        engine.updatePositionPrice(coin, lastCandle.close)
      }
    }

    const decision = await adapter.decide(context)

    if (decision.action === 'hold') {
      return { decision, executed: false, reason: 'hold' }
    }

    if (decision.size > autoTradeLimit && onApprovalNeeded) {
      const approved = await onApprovalNeeded(decision)
      if (!approved) {
        return { decision, executed: false, reason: 'rejected by user' }
      }
    }

    const result = await engine.execute(decision)

    if (result.executed && notifier) {
      await notifier.tradeExecuted({
        coin: decision.coin,
        side: decision.action as 'buy' | 'sell',
        size: decision.size,
        fillPrice: result.order?.fillPrice ?? 0,
        reasoning: decision.reasoning,
      })
    }

    return { decision, executed: result.executed, reason: result.reason }
  }
}

import type { LLMDecision, TradingContext, WorldSnapshot, Position, Order, Trade } from '@trader/shared'
import type { LLMAdapter } from './adapters/base.js'

export interface PipelineLike {
  fetch(): Promise<WorldSnapshot>
}

export interface EngineLike {
  execute(decision: LLMDecision): Promise<{ executed: boolean; reason?: string; order?: { fillPrice?: number } }>
  updatePositionPrice(coin: string, price: number): void
  checkStopLosses(): Promise<void>
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
  /** Called each cycle to populate recentTrades in the LLM context. */
  getRecentTrades?: () => Promise<Trade[]>
  onApprovalNeeded?: (decision: LLMDecision) => Promise<boolean>
  notifier?: NotifierLike
  /**
   * Fraction of available capital to risk per trade when a stopLoss is provided.
   * size = availableCapital * riskPerTradePct / stopDistance. Default: 0.01 (1%).
   */
  riskPerTradePct?: number
  /**
   * Minimum confidence for a non-hold decision to proceed. Default: 0.6.
   * Decisions below this threshold are blocked before reaching the engine.
   */
  minConfidence?: number
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
    const {
      pipeline, adapter, engine, autoTradeLimit, onApprovalNeeded, notifier, getRecentTrades,
      riskPerTradePct = 0.01,
      minConfidence = 0.6,
    } = this.config

    const snapshot = await pipeline.fetch()
    const recentTrades = (await getRecentTrades?.()) ?? []

    const context: TradingContext = {
      snapshot,
      positions: engine.getPositions(),
      availableCapital: engine.availableCapital(),
      recentTrades,
      openOrders: engine.getOpenOrders(),
    }

    // Update position prices from latest candle closes, then enforce stop-losses.
    for (const [coin, candles] of Object.entries(snapshot.ohlcv)) {
      const lastCandle = candles[candles.length - 1]
      if (lastCandle) {
        engine.updatePositionPrice(coin, lastCandle.close)
      }
    }
    await engine.checkStopLosses()

    const decision = await adapter.decide(context)

    if (decision.action === 'hold') {
      return { decision, executed: false, reason: 'hold' }
    }

    // Confidence gate — only blocks buys; sells should always pass through (stops/TP are the exit safety net).
    if (decision.action === 'buy' && decision.confidence < minConfidence) {
      return { decision, executed: false, reason: `Confidence ${decision.confidence.toFixed(2)} below threshold ${minConfidence}` }
    }

    // Risk-based sizing for buys with a stop-loss.
    if (decision.action === 'buy' && decision.stopLoss !== undefined) {
      const candles = snapshot.ohlcv[decision.coin]
      const currentPrice = candles?.[candles.length - 1]?.close
      if (currentPrice && currentPrice > 0) {
        const stopDistance = (currentPrice - decision.stopLoss) / currentPrice
        if (stopDistance < 0.003) {
          return { decision, executed: false, reason: `Stop too tight: ${(stopDistance * 100).toFixed(2)}% < 0.3% minimum` }
        }
        if (stopDistance > 0.15) {
          return { decision, executed: false, reason: `Stop too loose: ${(stopDistance * 100).toFixed(2)}% > 15% maximum` }
        }
        decision.size = Math.min(
          (engine.availableCapital() * riskPerTradePct) / stopDistance,
          autoTradeLimit,
        )
      }
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

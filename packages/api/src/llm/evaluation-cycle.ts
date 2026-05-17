import type { LLMDecision, TradingContext, WorldSnapshot, Position, Order, Trade, NarrationGranularity, FeatureSet, Regime, Lesson, CalibrationBucket } from '../common'
import type { LLMAdapter } from './adapters/base'
import { computeFeatures } from './features'
import { classifyRegime } from './regime'

export interface PipelineLike {
  fetch(): Promise<WorldSnapshot>
}

export interface EngineLike {
  execute(decision: LLMDecision): Promise<{ executed: boolean; reason?: string; order?: Order; scaledIn?: boolean }>
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
  /** Called each cycle to populate the narration recaps in the LLM context. */
  getNarrations?: () => Promise<Partial<Record<NarrationGranularity, string>>>
  /** Called each cycle to populate the active critic lessons in the LLM context. */
  getLessons?: () => Promise<Lesson[]>
  /** Called each cycle to populate the confidence-calibration curve in the LLM context. */
  getCalibration?: () => Promise<CalibrationBucket[]>
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
  /** User-editable prompt strings. When absent, prompt-builder defaults are used. */
  promptOverrides?: { strategyPrompt: string; promptTemplate: string }
}

export interface CycleResult {
  /** The raw decision as returned by the LLM adapter — never mutated. */
  decision: LLMDecision
  /** The decision that was actually forwarded to the engine (may have size overridden by risk sizing). */
  executedDecision: LLMDecision
  executed: boolean
  reason?: string
  /** True when the buy added to an existing position rather than opening a new one. */
  scaledIn?: boolean
  /** Deterministic feature snapshot for the decision's coin at decide time. */
  features?: FeatureSet | null
  /** Deterministic market regime for the decision's coin at decide time. */
  regime?: Regime | null
}

export class EvaluationCycle {
  private readonly config: EvaluationCycleConfig

  constructor(config: EvaluationCycleConfig) {
    this.config = config
  }

  /** Applies runtime-editable settings without rebuilding the cycle. */
  applySettings(settings: {
    minConfidence: number
    riskPerTradePct: number
    autoTradeLimit: number
    strategyPrompt: string
    promptTemplate: string
  }): void {
    this.config.minConfidence = settings.minConfidence
    this.config.riskPerTradePct = settings.riskPerTradePct
    this.config.autoTradeLimit = settings.autoTradeLimit
    this.config.promptOverrides = {
      strategyPrompt: settings.strategyPrompt,
      promptTemplate: settings.promptTemplate,
    }
  }

  /**
   * Runs one evaluation cycle. The adapter may return several decisions — one
   * per coin it has a view on — and each is gated, risk-sized, and executed
   * independently, so a single cycle can open positions in multiple coins.
   */
  async run(): Promise<CycleResult[]> {
    const { pipeline, adapter, engine, getRecentTrades, getNarrations, getLessons, getCalibration } = this.config

    const snapshot = await pipeline.fetch()
    const recentTrades = (await getRecentTrades?.()) ?? []
    const narrations = await getNarrations?.()
    const lessons = await getLessons?.()
    const calibration = await getCalibration?.()

    const context: TradingContext = {
      snapshot,
      positions: engine.getPositions(),
      availableCapital: engine.availableCapital(),
      recentTrades,
      openOrders: engine.getOpenOrders(),
      promptOverrides: this.config.promptOverrides,
      narrations,
      lessons,
      calibration,
    }

    // Update position prices from latest candle closes, then enforce stop-losses.
    for (const [coin, candles] of Object.entries(snapshot.ohlcv)) {
      const lastCandle = candles[candles.length - 1]
      if (lastCandle) {
        engine.updatePositionPrice(coin, lastCandle.close)
      }
    }
    await engine.checkStopLosses()

    // Adapters return one decision per coin; a legacy single-decision return is
    // normalised to a one-element list.
    const raw = await adapter.decide(context)
    const decisions = Array.isArray(raw) ? raw : [raw]
    if (decisions.length === 0) {
      const decision: LLMDecision = { action: 'hold', coin: '', size: 0, confidence: 0, reasoning: 'no decision returned' }
      return [{ decision, executedDecision: { ...decision }, executed: false, reason: 'hold' }]
    }

    // Execute sells before buys so capital freed this cycle is available to
    // risk-size the buys. Decisions are gated and sized one at a time, each
    // seeing the engine state left by the previous one.
    const actionRank = { sell: 0, hold: 1, buy: 2 } as const
    const ordered = [...decisions].sort((a, b) => actionRank[a.action] - actionRank[b.action])

    // BTC's features are market-wide context for every coin's regime.
    const btcFeatures = computeFeatures(snapshot.ohlcv['BTC/USDT'] ?? [])

    const results: CycleResult[] = []
    for (const decision of ordered) {
      const result = await this.evaluateDecision(decision, snapshot)
      // Snapshot the coin's deterministic features and regime as at decide time.
      const features = computeFeatures(snapshot.ohlcv[decision.coin] ?? [])
      result.features = features
      result.regime = features ? classifyRegime(features, btcFeatures) : null
      results.push(result)
    }
    return results
  }

  /** Gates, risk-sizes, and executes a single decision. */
  private async evaluateDecision(decision: LLMDecision, snapshot: WorldSnapshot): Promise<CycleResult> {
    const {
      engine, autoTradeLimit, onApprovalNeeded, notifier,
      riskPerTradePct = 0.01,
      minConfidence = 0.6,
    } = this.config

    // executedDecision starts as a copy; risk sizing may override its size without touching decision.
    let executedDecision: LLMDecision = { ...decision }

    if (decision.action === 'hold') {
      return { decision, executedDecision, executed: false, reason: 'hold' }
    }

    // Confidence gate — only blocks buys; sells should always pass through (stops/TP are the exit safety net).
    if (decision.action === 'buy' && decision.confidence < minConfidence) {
      return { decision, executedDecision, executed: false, reason: `Confidence ${decision.confidence.toFixed(2)} below threshold ${minConfidence}` }
    }

    // Hard-reject buys without a stop-loss — the system prompt mandates one, this enforces it.
    if (decision.action === 'buy' && decision.stopLoss === undefined) {
      return { decision, executedDecision, executed: false, reason: 'buy rejected: no stop-loss provided' }
    }

    // Risk-based sizing for buys with a stop-loss. An out-of-band stop is
    // clamped into [0.3%, 15%] rather than dropping the trade — a bad stop
    // price should not cost a tradeable signal.
    if (decision.action === 'buy' && decision.stopLoss !== undefined) {
      const candles = snapshot.ohlcv[decision.coin]
      const currentPrice = candles?.[candles.length - 1]?.close
      if (currentPrice && currentPrice > 0) {
        const MIN_STOP_DISTANCE = 0.003
        const MAX_STOP_DISTANCE = 0.15
        const rawDistance = (currentPrice - decision.stopLoss) / currentPrice
        const stopDistance = Math.min(Math.max(rawDistance, MIN_STOP_DISTANCE), MAX_STOP_DISTANCE)
        // When the stop was clamped, move stopLoss to match the clamped distance.
        const stopLoss = stopDistance === rawDistance ? decision.stopLoss : currentPrice * (1 - stopDistance)
        const riskSize = Math.min(
          (engine.availableCapital() * riskPerTradePct) / stopDistance,
          autoTradeLimit,
        )
        executedDecision = { ...decision, size: riskSize, stopLoss }
      }
    }

    if (executedDecision.size > autoTradeLimit && onApprovalNeeded) {
      const approved = await onApprovalNeeded(executedDecision)
      if (!approved) {
        return { decision, executedDecision, executed: false, reason: 'rejected by user' }
      }
    }

    const result = await engine.execute(executedDecision)

    if (result.executed && notifier) {
      const fillPrice = result.order?.status === 'filled' ? result.order.fillPrice : 0
      await notifier.tradeExecuted({
        coin: executedDecision.coin,
        side: executedDecision.action as 'buy' | 'sell',
        size: executedDecision.size,
        fillPrice,
        reasoning: executedDecision.reasoning,
      })
    }

    return { decision, executedDecision, executed: result.executed, reason: result.reason, scaledIn: result.scaledIn }
  }
}

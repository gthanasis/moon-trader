import type { LLMDecision, TradingContext, WorldSnapshot, Position, Order } from '@trader/shared'
import type { LLMAdapter } from './adapters/base.js'

interface PipelineLike {
  fetch(): Promise<WorldSnapshot>
}

interface EngineLike {
  execute(decision: LLMDecision): Promise<{ executed: boolean; reason?: string }>
  getPositions(): Position[]
  getOpenOrders(): Order[]
  availableCapital(): number
}

export interface EvaluationCycleConfig {
  pipeline: PipelineLike
  adapter: LLMAdapter
  engine: EngineLike
  autoTradeLimit: number
  onApprovalNeeded?: (decision: LLMDecision) => Promise<boolean>
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
    const { pipeline, adapter, engine, autoTradeLimit, onApprovalNeeded } = this.config

    const snapshot = await pipeline.fetch()
    const context: TradingContext = {
      snapshot,
      positions: engine.getPositions(),
      availableCapital: engine.availableCapital(),
      recentTrades: [],
      openOrders: engine.getOpenOrders(),
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
    return { decision, executed: result.executed, reason: result.reason }
  }
}

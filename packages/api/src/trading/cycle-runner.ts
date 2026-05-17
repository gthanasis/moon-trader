import { randomUUID } from 'crypto'
import { Logger } from '@nestjs/common'
import type { EvaluationCycle, CycleResult } from '../llm'
import type { TradingEngine } from '../core'
import type { DecisionRepository } from '../prisma/repositories/decision.repository'
import type { TradeRepository } from '../prisma/repositories/trade.repository'
import type { EventsService } from '../events/events.service'

/**
 * Runs one evaluation cycle and persists its decision and any resulting trade.
 *
 * Pause gating: when `isPaused()` returns true the cycle is skipped entirely.
 * Sells and stop/TP exits are persisted via engine.onPositionClosed; this
 * function only persists the open trade row when a buy fills.
 *
 * `logger` is supplied by TradingService so the cycle logs under the same
 * context as the rest of the trading module.
 */
export async function runCycleWithPersistence(
  cycle: EvaluationCycle,
  engine: TradingEngine,
  decisionRepo: DecisionRepository,
  tradeRepo: TradeRepository,
  isPaused: () => Promise<boolean> = async () => false,
  logger: Logger = new Logger('TradingService'),
  events?: EventsService,
): Promise<CycleResult[] | null> {
  if (await isPaused()) {
    logger.log('Cycle skipped: bot paused')
    return null
  }

  // A cycle now yields one result per coin the LLM weighed in on; persist and
  // announce each independently.
  const results = await cycle.run()

  for (const result of results) {
    const status = result.executed ? 'executed' : 'blocked'
    // 'hold' is not a rejection — don't surface it as a blocked reason.
    const blockedReason = !result.executed && result.decision.action !== 'hold' ? (result.reason ?? null) : null
    logger.log(
      `Cycle ${result.decision.action.toUpperCase()} ${result.decision.coin} ` +
        `confidence=${result.decision.confidence.toFixed(2)} ${status} ${result.reason ?? ''}`.trimEnd(),
    )

    events?.emit('decision_made', {
      action: result.decision.action,
      coin: result.decision.coin,
      confidence: result.decision.confidence,
      reasoning: result.decision.reasoning,
      executed: result.executed,
      blockedReason,
    })

    const decisionId = await decisionRepo.saveDecision(result.decision, status, blockedReason, result.features ?? null, result.regime ?? null).catch(err => {
      logger.error(`Failed to persist decision: ${String(err)}`)
      return null
    })

    // Persist a new open trade row when a buy fills — but not when the buy
    // scaled into an existing position (no new trade row; the open row stands).
    if (result.executed && result.executedDecision.action === 'buy' && decisionId && !result.scaledIn) {
      const position = engine.getPositions().find(p => p.coin === result.executedDecision.coin)
      const trade = {
        id: randomUUID(),
        coin: result.executedDecision.coin,
        side: 'buy' as const,
        size: position?.size ?? result.executedDecision.size,
        entryPrice: position?.entryPrice ?? 0,
        openedAt: new Date(),
        reasoning: result.decision.reasoning,
      }
      // Tag the row with the engine's current mode — paper/real is runtime-switchable.
      await tradeRepo.saveTrade(trade, engine.isPaper() ? 'paper' : 'live').catch(err => {
        logger.error(`Failed to persist trade: ${String(err)}`)
      })
      await decisionRepo.linkDecisionToTrade(decisionId, trade.id).catch(err => {
        logger.error(`Failed to link decision to trade: ${String(err)}`)
      })
      events?.emit('trade_opened', { coin: trade.coin, size: trade.size, entryPrice: trade.entryPrice })
    }
  }

  return results
}

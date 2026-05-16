import { randomUUID } from 'crypto'
import type { EvaluationCycle, CycleResult } from '../llm'
import type { TradingEngine } from '../core'
import type { DecisionRepository } from '../prisma/repositories/decision.repository'
import type { TradeRepository } from '../prisma/repositories/trade.repository'

/**
 * Runs one evaluation cycle and persists its decision and any resulting trade.
 *
 * Pause gating: when `isPaused()` returns true the cycle is skipped entirely.
 * Sells and stop/TP exits are persisted via engine.onPositionClosed; this
 * function only persists the open trade row when a buy fills.
 */
export async function runCycleWithPersistence(
  cycle: EvaluationCycle,
  engine: TradingEngine,
  decisionRepo: DecisionRepository,
  tradeRepo: TradeRepository,
  paper: boolean,
  isPaused: () => Promise<boolean> = async () => false,
): Promise<CycleResult | null> {
  if (await isPaused()) {
    console.log(`[Cycle] ${new Date().toISOString()} — skipped: bot paused`)
    return null
  }

  const result = await cycle.run()
  const status = result.executed ? 'executed' : 'blocked'
  // 'hold' is not a rejection — don't surface it as a blocked reason.
  const blockedReason = !result.executed && result.decision.action !== 'hold' ? (result.reason ?? null) : null
  console.log(`[Cycle] ${new Date().toISOString()} — ${result.decision.action.toUpperCase()} ${result.decision.coin} confidence=${result.decision.confidence.toFixed(2)} ${status} ${result.reason ?? ''}`.trimEnd())

  const decisionId = await decisionRepo.saveDecision(result.decision, status, blockedReason).catch(err => {
    console.error('[LiveTrader] Failed to persist decision:', err)
    return null
  })

  // Persist a new open trade row when a buy fills.
  if (result.executed && result.executedDecision.action === 'buy' && decisionId) {
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
    await tradeRepo.saveTrade(trade, paper ? 'paper' : 'live').catch(err => {
      console.error('[LiveTrader] Failed to persist trade:', err)
    })
    await decisionRepo.linkDecisionToTrade(decisionId, trade.id).catch(err => {
      console.error('[LiveTrader] Failed to link decision to trade:', err)
    })
  }

  return result
}

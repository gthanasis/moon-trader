import { Injectable, Logger } from '@nestjs/common'
import type { NarrationGranularity } from '../common'
import { TradeRepository } from '../prisma/repositories/trade.repository'
import { DecisionRepository } from '../prisma/repositories/decision.repository'
import { NarrationRepository } from '../prisma/repositories/narration.repository'
import { NarrationLlmService } from './narration-llm.service'
import { buildBlockPrompt, buildRollupPrompt } from './narration-prompt'
import { computeStats, aggregateStats } from './narration-stats'
import { periodEndOf } from './narration-periods'

/**
 * Generates the narration hierarchy:
 * - `generateBlock` / `generateFromRaw` — directly from trades + decisions.
 * - `generateRollup` — by summarising the finer-grained child narrations,
 *   falling back to raw generation when no children exist.
 */
@Injectable()
export class NarrationService {
  private readonly logger = new Logger(NarrationService.name)

  constructor(
    private readonly trades: TradeRepository,
    private readonly decisions: DecisionRepository,
    private readonly narrations: NarrationRepository,
    private readonly llm: NarrationLlmService,
  ) {}

  /** Generates the 6h narration block starting at `periodStart` (6h-aligned). */
  generateBlock(periodStart: Date): Promise<void> {
    return this.generateFromRaw('6h', periodStart)
  }

  /**
   * Generates a narration for any granularity directly from the trades closed
   * and decisions made in its window. Used for 6h blocks and as the roll-up
   * fallback when a period has no child narrations.
   */
  async generateFromRaw(granularity: NarrationGranularity, periodStart: Date): Promise<void> {
    const periodEnd = periodEndOf(granularity, periodStart)

    const [trades, decisions] = await Promise.all([
      this.trades.findClosedBetween(periodStart, periodEnd),
      this.decisions.findBetween(periodStart, periodEnd),
    ])

    const stats = computeStats(trades)

    // Empty period — skip the LLM call entirely (keeps backfill cheap).
    if (trades.length === 0 && decisions.length === 0) {
      await this.narrations.upsert({
        granularity,
        periodStart,
        periodEnd,
        summary: 'No trading activity in this period.',
        assessment: null,
        stats,
      })
      return
    }

    const text = await this.llm.narrate(
      buildBlockPrompt({ granularity, periodStart, periodEnd, trades, decisions, stats }),
    )

    await this.narrations.upsert({
      granularity,
      periodStart,
      periodEnd,
      summary: text.summary,
      assessment: text.assessment,
      stats,
    })
    this.logger.log(
      `Narration ${granularity} ${periodStart.toISOString()} (raw) — ${stats.trades} trades, pnl ${stats.pnl.toFixed(2)}`,
    )
  }

  /**
   * Generates a roll-up narration (day/week/month) by summarising its child
   * narrations. When no children exist, falls back to raw generation so past
   * periods are still narrated.
   */
  async generateRollup(granularity: NarrationGranularity, periodStart: Date): Promise<void> {
    const periodEnd = periodEndOf(granularity, periodStart)
    const children = await this.narrations.findChildren(granularity, periodStart, periodEnd)

    if (children.length === 0) {
      this.logger.log(
        `Narration ${granularity} ${periodStart.toISOString()} — no children, generating from raw`,
      )
      await this.generateFromRaw(granularity, periodStart)
      return
    }

    const stats = aggregateStats(children.map(c => c.stats))

    // No trades across the whole period — canned summary, no LLM call.
    if (stats.trades === 0) {
      await this.narrations.upsert({
        granularity,
        periodStart,
        periodEnd,
        summary: 'No trading activity in this period.',
        assessment: null,
        stats,
      })
      return
    }

    const text = await this.llm.narrate(
      buildRollupPrompt({ granularity, periodStart, periodEnd, children, stats }),
    )

    await this.narrations.upsert({
      granularity,
      periodStart,
      periodEnd,
      summary: text.summary,
      assessment: text.assessment,
      stats,
    })
    this.logger.log(
      `Narration ${granularity} ${periodStart.toISOString()} (rollup of ${children.length}) — pnl ${stats.pnl.toFixed(2)}`,
    )
  }
}

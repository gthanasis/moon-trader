import { Injectable, Logger } from '@nestjs/common'
import { TradeRepository } from '../prisma/repositories/trade.repository'
import { DecisionRepository } from '../prisma/repositories/decision.repository'
import { NarrationRepository } from '../prisma/repositories/narration.repository'
import { NarrationLlmService } from './narration-llm.service'
import { buildBlockPrompt } from './narration-prompt'
import { computeStats } from './narration-stats'
import { periodEndOf } from './narration-periods'

/**
 * Generates the narration hierarchy. `generateBlock` produces the finest level
 * (6h) directly from trades and decisions; roll-ups (day/week/month) are added
 * in a later task.
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

  /**
   * Generates (or regenerates) the 6h narration block starting at `periodStart`,
   * which must be 6h-aligned. Reads the trades closed and decisions made in the
   * window, computes stats, asks the LLM for a recap, and upserts it.
   */
  async generateBlock(periodStart: Date): Promise<void> {
    const periodEnd = periodEndOf('6h', periodStart)

    const [trades, decisions] = await Promise.all([
      this.trades.findClosedBetween(periodStart, periodEnd),
      this.decisions.findBetween(periodStart, periodEnd),
    ])

    const stats = computeStats(trades)
    const prompt = buildBlockPrompt({
      granularity: '6h',
      periodStart,
      periodEnd,
      trades,
      decisions,
      stats,
    })
    const text = await this.llm.narrate(prompt)

    await this.narrations.upsert({
      granularity: '6h',
      periodStart,
      periodEnd,
      summary: text.summary,
      assessment: text.assessment,
      stats,
    })
    this.logger.log(
      `Narration 6h ${periodStart.toISOString()} — ${stats.trades} trades, pnl ${stats.pnl.toFixed(2)}`,
    )
  }
}

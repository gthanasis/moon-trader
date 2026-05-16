import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common'
import type { NarrationGranularity } from '../common'
import { Scheduler } from '../trading/scheduler'
import { NarrationService } from './narration.service'
import { floorToPeriod } from './narration-periods'

/**
 * Schedules narration generation off the trading loop. Each job, when it fires,
 * narrates the period that just *ended* (never the in-progress one).
 *
 * - 6h block:  00/06/12/18 + a few minutes
 * - day:       daily, just after midnight UTC
 * - week:      Mondays, just after midnight UTC
 * - month:     the 1st, just after midnight UTC
 */
@Injectable()
export class NarrationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NarrationScheduler.name)
  private readonly schedulers: Scheduler[] = []

  constructor(private readonly narration: NarrationService) {}

  onModuleInit(): void {
    this.add('2 0,6,12,18 * * *', () => this.narration.generateBlock(this.justEnded('6h')))
    this.add('5 0 * * *', () => this.narration.generateRollup('day', this.justEnded('day')))
    this.add('10 0 * * 1', () => this.narration.generateRollup('week', this.justEnded('week')))
    this.add('15 0 1 * *', () => this.narration.generateRollup('month', this.justEnded('month')))
    this.logger.log('Narration jobs scheduled (6h / day / week / month)')
  }

  onModuleDestroy(): void {
    for (const s of this.schedulers) s.stop()
  }

  /** Start of the most recently completed period for the given granularity. */
  private justEnded(granularity: NarrationGranularity): Date {
    // Step back a minute so a job firing on the boundary lands in the prior period.
    return floorToPeriod(granularity, new Date(Date.now() - 60_000))
  }

  private add(cron: string, run: () => Promise<void>): void {
    const scheduler = new Scheduler({ run: async () => run() }, cron)
    scheduler.start()
    this.schedulers.push(scheduler)
  }
}

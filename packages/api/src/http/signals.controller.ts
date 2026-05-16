import { Controller, Get, Query } from '@nestjs/common'
import type { Signal } from '../common'
import { SignalRepository } from '../prisma/repositories/signal.repository'

@Controller('signals')
export class SignalsController {
  constructor(private readonly signals: SignalRepository) {}

  /**
   * Signals newer than `sinceMs` milliseconds ago (default: last 24h).
   */
  @Get()
  list(@Query('sinceMs') sinceMs?: string): Promise<Signal[]> {
    const ms = Number(sinceMs)
    const window = Number.isFinite(ms) && ms > 0 ? ms : 24 * 60 * 60 * 1000
    return this.signals.findSignalsSince(new Date(Date.now() - window))
  }
}

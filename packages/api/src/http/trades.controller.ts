import { Controller, Get, Query } from '@nestjs/common'
import type { Trade } from '../common'
import { TradeRepository } from '../prisma/repositories/trade.repository'

@Controller('trades')
export class TradesController {
  constructor(private readonly trades: TradeRepository) {}

  /** Recent trades (most recent first) — `limit` defaults to 100. */
  @Get()
  list(@Query('limit') limit?: string): Promise<Trade[]> {
    const n = Number(limit)
    return this.trades.findRecentTrades(Number.isFinite(n) && n > 0 ? n : 100)
  }
}

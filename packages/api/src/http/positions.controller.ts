import { Controller, Get } from '@nestjs/common'
import { TradeRepository } from '../prisma/repositories/trade.repository'

@Controller('positions')
export class PositionsController {
  constructor(private readonly trades: TradeRepository) {}

  /** Open positions — replaces web's GET /api/positions. */
  @Get()
  list() {
    return this.trades.findOpenTrades()
  }
}

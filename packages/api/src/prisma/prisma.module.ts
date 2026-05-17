import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'
import { TradeRepository } from './repositories/trade.repository'
import { SignalRepository } from './repositories/signal.repository'
import { DecisionRepository } from './repositories/decision.repository'
import { CandleRepository } from './repositories/candle.repository'
import { BotStateRepository } from './repositories/bot-state.repository'
import { BacktestRunRepository } from './repositories/backtest-run.repository'
import { NarrationRepository } from './repositories/narration.repository'
import { LessonRepository } from './repositories/lesson.repository'

const providers = [
  PrismaService,
  TradeRepository,
  SignalRepository,
  DecisionRepository,
  CandleRepository,
  BotStateRepository,
  BacktestRunRepository,
  NarrationRepository,
  LessonRepository,
]

/**
 * Global so any feature module can inject a repository without re-importing
 * PrismaModule. There is exactly one PrismaService (one connection pool).
 */
@Global()
@Module({
  providers,
  exports: providers,
})
export class PrismaModule {}

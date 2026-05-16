import { Module } from '@nestjs/common'
import { BacktestService } from './backtest.service'

/** Repositories come from the global PrismaModule. */
@Module({
  providers: [BacktestService],
  exports: [BacktestService],
})
export class BacktestModule {}

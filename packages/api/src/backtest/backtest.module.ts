import { Module } from '@nestjs/common'
import { BacktestService } from './backtest.service'
import { SettingsModule } from '../settings/settings.module'

/** Repositories come from the global PrismaModule. */
@Module({
  imports: [SettingsModule],
  providers: [BacktestService],
  exports: [BacktestService],
})
export class BacktestModule {}

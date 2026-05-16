import { Module } from '@nestjs/common'
import { BacktestModule } from '../backtest/backtest.module'
import { SettingsModule } from '../settings/settings.module'
import { PositionsController } from './positions.controller'
import { DecisionsController } from './decisions.controller'
import { BacktestController } from './backtest.controller'
import { SettingsController } from './settings.controller'
import { BotController } from './bot.controller'

/**
 * HTTP layer. Repositories come from the global PrismaModule; BacktestService
 * and SettingsService come from their feature modules.
 */
@Module({
  imports: [BacktestModule, SettingsModule],
  controllers: [
    PositionsController,
    DecisionsController,
    BacktestController,
    SettingsController,
    BotController,
  ],
})
export class HttpModule {}

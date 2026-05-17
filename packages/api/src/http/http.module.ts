import { Module } from '@nestjs/common'
import { BacktestModule } from '../backtest/backtest.module'
import { SettingsModule } from '../settings/settings.module'
import { CalibrationService } from '../llm'
import { PositionsController } from './positions.controller'
import { DecisionsController } from './decisions.controller'
import { BacktestController } from './backtest.controller'
import { SettingsController } from './settings.controller'
import { BotController } from './bot.controller'
import { TradesController } from './trades.controller'
import { SignalsController } from './signals.controller'
import { NarrationController } from './narration.controller'
import { CalibrationController } from './calibration.controller'

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
    TradesController,
    SignalsController,
    NarrationController,
    CalibrationController,
  ],
  providers: [CalibrationService],
})
export class HttpModule {}

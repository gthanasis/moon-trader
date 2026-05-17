import { Module } from '@nestjs/common'
import { SettingsModule } from '../settings/settings.module'
import { TelegramModule } from '../telegram/telegram.module'
import { CalibrationService } from '../llm'
import { TradingService } from './trading.service'

/**
 * The live trading loop. Repositories come from the global PrismaModule;
 * settings and Telegram come from their feature modules.
 */
@Module({
  imports: [SettingsModule, TelegramModule],
  providers: [TradingService, CalibrationService],
  exports: [TradingService],
})
export class TradingModule {}

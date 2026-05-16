import { Module } from '@nestjs/common'
import { SettingsModule } from '../settings/settings.module'
import { TelegramModule } from '../telegram/telegram.module'
import { TradingService } from './trading.service'

/**
 * The live trading loop. Repositories come from the global PrismaModule;
 * settings and Telegram come from their feature modules.
 */
@Module({
  imports: [SettingsModule, TelegramModule],
  providers: [TradingService],
  exports: [TradingService],
})
export class TradingModule {}

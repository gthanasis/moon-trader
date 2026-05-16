import { Module } from '@nestjs/common'
import { SettingsService } from './settings.service'

/**
 * BotStateRepository comes from the global PrismaModule, so this module only
 * declares SettingsService and exports it for TradingModule and the HTTP layer.
 */
@Module({
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}

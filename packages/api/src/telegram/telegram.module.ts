import { Module } from '@nestjs/common'
import { TelegramService } from './telegram.service'

/**
 * BotStateRepository comes from the global PrismaModule. TelegramService is
 * exported so TradingModule can reach the notifier and approval manager.
 */
@Module({
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}

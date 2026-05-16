import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { resolve } from 'path'
import { HealthController } from './health/health.controller'
import { PrismaModule } from './prisma/prisma.module'
import { SettingsModule } from './settings/settings.module'
import { TelegramModule } from './telegram/telegram.module'
import { TradingModule } from './trading/trading.module'
import { NarrationModule } from './narration/narration.module'
import { HttpModule } from './http/http.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Restart-only config lives in the repo-root .env.
      envFilePath: resolve(__dirname, '../../../.env'),
    }),
    PrismaModule,
    SettingsModule,
    TelegramModule,
    TradingModule,
    NarrationModule,
    HttpModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

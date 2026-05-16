import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { resolve } from 'path'
import { HealthController } from './health/health.controller'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Restart-only config lives in the repo-root .env.
      envFilePath: resolve(__dirname, '../../../.env'),
    }),
  ],
  controllers: [HealthController],
})
export class AppModule {}

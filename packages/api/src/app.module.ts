import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { resolve } from 'path'
import { HealthController } from './health/health.controller'
import { PrismaModule } from './prisma/prisma.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Restart-only config lives in the repo-root .env.
      envFilePath: resolve(__dirname, '../../../.env'),
    }),
    PrismaModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

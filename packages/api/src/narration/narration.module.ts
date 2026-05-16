import { Module } from '@nestjs/common'
import { NarrationService } from './narration.service'
import { NarrationLlmService } from './narration-llm.service'
import { NarrationScheduler } from './narration.scheduler'

/**
 * Narration generation. Repositories come from the global PrismaModule.
 * NarrationService is exported for the HTTP layer.
 */
@Module({
  providers: [NarrationService, NarrationLlmService, NarrationScheduler],
  exports: [NarrationService],
})
export class NarrationModule {}

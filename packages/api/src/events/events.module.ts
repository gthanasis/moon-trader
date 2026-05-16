import { Global, Module } from '@nestjs/common'
import { EventsService } from './events.service'
import { EventsController } from './events.controller'

/**
 * Global so any producer (e.g. TradingService) can inject EventsService
 * without re-importing this module.
 */
@Global()
@Module({
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}

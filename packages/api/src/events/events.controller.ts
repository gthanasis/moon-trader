import { Controller, Sse, type MessageEvent } from '@nestjs/common'
import { map, type Observable } from 'rxjs'
import { EventsService } from './events.service'

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /** Real-time bot activity as Server-Sent Events. */
  @Sse()
  stream(): Observable<MessageEvent> {
    return this.events.stream().pipe(map(event => ({ data: event })))
  }
}

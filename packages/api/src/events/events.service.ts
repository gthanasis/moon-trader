import { Injectable } from '@nestjs/common'
import { Subject, type Observable } from 'rxjs'
import type { AppEvent, AppEventType } from '../common'

/**
 * Fan-out hub for real-time events. Producers (the trading loop) call `emit`;
 * every `/events` SSE client subscribes to the same stream. Stateless — no
 * buffering; clients that connect later only see subsequent events.
 */
@Injectable()
export class EventsService {
  private readonly subject = new Subject<AppEvent>()

  /** Publishes an event to all connected SSE clients. */
  emit(type: AppEventType, payload: Record<string, unknown> = {}): void {
    this.subject.next({ type, at: new Date().toISOString(), payload })
  }

  /** The shared event stream, for the SSE controller to subscribe to. */
  stream(): Observable<AppEvent> {
    return this.subject.asObservable()
  }
}

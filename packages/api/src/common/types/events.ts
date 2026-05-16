/** Kinds of real-time events the API pushes to the dashboard. */
export type AppEventType =
  | 'cycle_started'
  | 'decision_made'
  | 'trade_opened'
  | 'trade_closed'
  | 'signals_ingested'

/**
 * A real-time event streamed over SSE (`GET /events`). `payload` shape depends
 * on `type`; the dashboard renders each kind from its payload.
 */
export interface AppEvent {
  type: AppEventType
  /** ISO timestamp of when the event occurred. */
  at: string
  payload: Record<string, unknown>
}

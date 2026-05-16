'use client'

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { eventsUrl, type AppEvent } from './api-client'

const MAX_EVENTS = 50
const BUFFER_KEY = ['appEvents'] as const

/**
 * Opens the single SSE connection to `/events` and bridges it into the React
 * Query cache: each event is appended to a rolling buffer and refreshes the
 * data it affects. Call this ONCE, near the root of the dashboard.
 */
export function useAppEvents(): void {
  const qc = useQueryClient()

  useEffect(() => {
    const es = new EventSource(eventsUrl())

    es.onmessage = e => {
      let event: AppEvent
      try {
        event = JSON.parse(e.data) as AppEvent
      } catch {
        return
      }

      qc.setQueryData<AppEvent[]>(BUFFER_KEY, prev => [event, ...(prev ?? [])].slice(0, MAX_EVENTS))

      switch (event.type) {
        case 'trade_opened':
        case 'trade_closed':
          void qc.invalidateQueries({ queryKey: ['positions'] })
          void qc.invalidateQueries({ queryKey: ['trades'] })
          break
        case 'decision_made':
          void qc.invalidateQueries({ queryKey: ['decisions'] })
          void qc.invalidateQueries({ queryKey: ['pendingDecision'] })
          break
        case 'signals_ingested':
          void qc.invalidateQueries({ queryKey: ['signals'] })
          break
      }
    }

    return () => es.close()
  }, [qc])
}

/** Reads the rolling buffer of recent live events filled by `useAppEvents`. */
export function useLiveEvents(): AppEvent[] {
  const { data } = useQuery<AppEvent[]>({
    queryKey: BUFFER_KEY,
    queryFn: () => [],
    staleTime: Infinity,
    initialData: [],
  })
  return data
}

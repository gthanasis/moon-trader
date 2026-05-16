import { describe, it, expect, beforeEach } from 'vitest'
import { EventsService } from '../../src/events/events.service'
import type { AppEvent } from '../../src/common'

describe('EventsService', () => {
  let service: EventsService

  beforeEach(() => {
    service = new EventsService()
  })

  it('delivers emitted events to a subscriber', () => {
    const received: AppEvent[] = []
    service.stream().subscribe(e => received.push(e))

    service.emit('decision_made', { coin: 'BTC/USDT', action: 'buy' })

    expect(received).toHaveLength(1)
    expect(received[0].type).toBe('decision_made')
    expect(received[0].payload).toEqual({ coin: 'BTC/USDT', action: 'buy' })
    expect(typeof received[0].at).toBe('string')
  })

  it('fans out the same event to multiple subscribers', () => {
    const a: AppEvent[] = []
    const b: AppEvent[] = []
    service.stream().subscribe(e => a.push(e))
    service.stream().subscribe(e => b.push(e))

    service.emit('cycle_started')

    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
  })

  it('does not replay past events to a late subscriber', () => {
    service.emit('cycle_started')
    const late: AppEvent[] = []
    service.stream().subscribe(e => late.push(e))
    expect(late).toHaveLength(0)

    service.emit('signals_ingested', { count: 3 })
    expect(late).toHaveLength(1)
  })
})

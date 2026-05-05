import { describe, it, expect, vi } from 'vitest'
import { Scheduler } from '../src/scheduler.js'

describe('Scheduler', () => {
  it('calls cycle.run() when the cron job fires', async () => {
    const run = vi.fn(async () => {})
    const scheduler = new Scheduler({ run }, '* * * * *')

    // Manually trigger the callback to simulate a cron tick
    await scheduler['tick']()

    expect(run).toHaveBeenCalledOnce()
  })

  it('does not throw when cycle.run() rejects — logs error instead', async () => {
    const run = vi.fn(async () => { throw new Error('cycle failed') })
    const scheduler = new Scheduler({ run }, '* * * * *')

    // Should not throw
    await expect(scheduler['tick']()).resolves.toBeUndefined()
    expect(run).toHaveBeenCalledOnce()
  })

  it('stop() cancels the scheduled job', () => {
    const scheduler = new Scheduler({ run: vi.fn() }, '*/15 * * * *')
    scheduler.start()
    scheduler.stop()
    // After stop, task should be null
    expect(scheduler['task']).toBeNull()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { Scheduler } from '../../src/trading/scheduler'

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
    expect(scheduler['task']).not.toBeNull()
    scheduler.stop()
    expect(scheduler['task']).toBeNull()
  })

  it('skips a tick that fires while previous cycle is still running', async () => {
    let resolveCycle!: () => void
    const run = vi.fn(() => new Promise<void>(resolve => { resolveCycle = resolve }))
    const scheduler = new Scheduler({ run }, '* * * * *')

    // Start first tick (does not finish)
    const first = scheduler['tick']()
    // Second tick fires while first is still running
    await scheduler['tick']()

    expect(run).toHaveBeenCalledOnce()

    // Let first finish
    resolveCycle()
    await first
  })
})

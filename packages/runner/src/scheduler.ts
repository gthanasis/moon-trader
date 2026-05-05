import cron from 'node-cron'
import type { ScheduledTask } from 'node-cron'

interface CycleLike {
  run(): Promise<unknown>
}

export class Scheduler {
  private task: ScheduledTask | null = null

  constructor(
    private readonly cycle: CycleLike,
    private readonly cronExpression: string,
  ) {}

  start(): void {
    this.task = cron.schedule(this.cronExpression, () => {
      void this.tick()
    })
  }

  stop(): void {
    this.task?.stop()
    this.task = null
  }

  private async tick(): Promise<void> {
    try {
      await this.cycle.run()
    } catch (err) {
      console.error('[Scheduler] Cycle error:', err)
    }
  }
}

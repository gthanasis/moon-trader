import cron from 'node-cron'
import type { ScheduledTask } from 'node-cron'

interface CycleLike {
  run(): Promise<unknown>
}

export class Scheduler {
  private task: ScheduledTask | null = null
  private isRunning = false
  private cronExpression: string

  constructor(
    private readonly cycle: CycleLike,
    cronExpression: string,
  ) {
    this.cronExpression = cronExpression
  }

  start(): void {
    this.task = cron.schedule(this.cronExpression, () => {
      void this.tick()
    })
  }

  stop(): void {
    this.task?.stop()
    this.task = null
  }

  /** The cron expression the scheduler is currently running on. */
  get expression(): string {
    return this.cronExpression
  }

  /** Restarts the scheduled task on a new cron expression. No-op if unchanged. */
  reschedule(cronExpression: string): void {
    if (cronExpression === this.cronExpression) return
    this.cronExpression = cronExpression
    if (this.task) {
      this.stop()
      this.start()
    }
  }

  private async tick(): Promise<void> {
    if (this.isRunning) return
    this.isRunning = true
    try {
      await this.cycle.run()
    } catch (err) {
      console.error('[Scheduler] Cycle error:', err)
    } finally {
      this.isRunning = false
    }
  }
}

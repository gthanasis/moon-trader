import type { WorldSnapshot, Signal } from '@trader/shared'
import type { DataSource } from './sources/base.js'

interface PipelineConfig {
  sources: DataSource[]
}

export class Pipeline {
  private readonly sources: DataSource[]

  constructor(config: PipelineConfig) {
    this.sources = config.sources
  }

  async fetch(): Promise<WorldSnapshot> {
    const results = await Promise.allSettled(
      this.sources.map(source => source.fetch())
    )

    const signals: Signal[] = results
      .filter((r): r is PromiseFulfilledResult<Signal[]> => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    return {
      timestamp: new Date(),
      signals,
      ohlcv: {},
    }
  }

  async fetchHistorical(from: Date, to: Date): Promise<WorldSnapshot> {
    const results = await Promise.allSettled(
      this.sources.map(source => source.fetchHistorical(from, to))
    )

    const signals: Signal[] = results
      .filter((r): r is PromiseFulfilledResult<Signal[]> => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    return {
      timestamp: to,
      signals,
      ohlcv: {},
    }
  }
}

import { Logger } from '@nestjs/common'
import type { WorldSnapshot, Signal, Candle } from '../common'
import type { DataSource } from './sources/base'
import type { OhlcvSource } from './sources/ohlcv-base'

interface PipelineConfig {
  sources: DataSource[]
  ohlcvSource?: OhlcvSource
  coins?: string[]
  timeframe?: string
  ohlcvLimit?: number
}

export class Pipeline {
  private readonly config: PipelineConfig
  private readonly logger = new Logger(Pipeline.name)

  constructor(config: PipelineConfig) {
    this.config = config
  }

  async fetch(): Promise<WorldSnapshot> {
    const { sources, ohlcvSource, coins, timeframe = '15m', ohlcvLimit = 100 } = this.config

    const [signalResults, ohlcv] = await Promise.all([
      Promise.allSettled(sources.map(source => source.fetch())),
      ohlcvSource && coins?.length
        ? ohlcvSource.fetchOhlcv(coins, timeframe, ohlcvLimit).catch((err) => {
            this.logger.error(`ohlcv fetch failed: ${String(err)}`)
            return {} as Record<string, Candle[]>
          })
        : Promise.resolve({} as Record<string, Candle[]>),
    ])

    const signals: Signal[] = signalResults
      .filter((r): r is PromiseFulfilledResult<Signal[]> => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    return { timestamp: new Date(), signals, ohlcv }
  }

  async fetchHistorical(from: Date, to: Date): Promise<WorldSnapshot> {
    const results = await Promise.allSettled(
      this.config.sources.map(source => source.fetchHistorical(from, to))
    )

    const signals: Signal[] = results
      .filter((r): r is PromiseFulfilledResult<Signal[]> => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    // historical OHLCV is provided by BacktestConfig, not fetched live
    return { timestamp: to, signals, ohlcv: {} }
  }
}

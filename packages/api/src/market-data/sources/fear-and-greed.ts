import type { Signal } from '../../common'
import type { DataSource } from './base'

interface FngDataPoint {
  value: string
  value_classification: string
  timestamp: string
}

interface FngResponse {
  data: FngDataPoint[]
}

export class FearAndGreedSource implements DataSource {
  readonly id = 'fear-and-greed'
  private readonly baseUrl = 'https://api.alternative.me/fng/'

  async fetch(): Promise<Signal[]> {
    try {
      const res = await fetch(`${this.baseUrl}?limit=1`)
      if (!res.ok) return []
      const body = (await res.json()) as FngResponse
      return body.data.map(d => this.toSignal(d))
    } catch {
      return []
    }
  }

  async fetchHistorical(from: Date, to: Date): Promise<Signal[]> {
    const days = Math.ceil((to.getTime() - from.getTime()) / 86_400_000) + 1
    try {
      const res = await fetch(`${this.baseUrl}?limit=${days}`)
      if (!res.ok) return []
      const body = (await res.json()) as FngResponse
      return body.data
        .map(d => this.toSignal(d))
        .filter(s => s.timestamp >= from && s.timestamp <= to)
    } catch {
      return []
    }
  }

  private toSignal(d: FngDataPoint): Signal {
    return {
      source: this.id,
      type: 'sentiment',
      content: `Crypto Fear & Greed Index: ${d.value} (${d.value_classification})`,
      timestamp: new Date(Number(d.timestamp) * 1000),
      raw: d,
    }
  }
}

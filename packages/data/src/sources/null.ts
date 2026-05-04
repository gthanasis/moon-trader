import type { Signal } from '@trader/shared'
import type { DataSource } from './base.js'

export class NullDataSource implements DataSource {
  readonly id = 'null'

  async fetch(): Promise<Signal[]> {
    return []
  }

  async fetchHistorical(_from: Date, _to: Date): Promise<Signal[]> {
    return []
  }
}

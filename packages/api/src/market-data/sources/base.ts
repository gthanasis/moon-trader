import type { Signal } from '../../common'

export interface DataSource {
  readonly id: string
  fetch(): Promise<Signal[]>
  fetchHistorical(from: Date, to: Date): Promise<Signal[]>
}

export type SignalType = 'news' | 'sentiment' | 'onchain' | 'macro' | 'price' | 'microstructure'

export interface Signal {
  source: string
  type: SignalType
  content: string
  timestamp: Date
  coins?: string[]
  raw?: unknown
}

export interface Candle {
  timestamp: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface WorldSnapshot {
  timestamp: Date
  signals: Signal[]
  ohlcv: Record<string, Candle[]>
}

import type { Signal } from '../../common'
import type { DataSource } from './base'
import type { LiquidationCollector } from './liquidation-collector'

/** Liquidation count in the window at or above which the bot flags a cascade. */
const CASCADE_COUNT = 5

/**
 * Reads the `LiquidationCollector`'s rolling buffer and emits a per-coin
 * liquidation summary signal — long vs short notional liquidated, plus a
 * cascade flag when many liquidations cluster. Coins with no liquidations in
 * the window emit no signal; an empty buffer simply yields no signals.
 */
export class LiquidationSource implements DataSource {
  readonly id = 'binance-liquidations'

  constructor(
    private readonly collector: LiquidationCollector,
    private readonly coins: string[],
  ) {}

  async fetch(): Promise<Signal[]> {
    const events = this.collector.getWindow()
    return this.coins
      .map(coin => this.summarise(coin, events.filter(e => e.coin === coin)))
      .filter((s): s is Signal => s !== null)
  }

  /** Liquidations are inherently live; historical replay is out of scope. */
  async fetchHistorical(_from: Date, _to: Date): Promise<Signal[]> {
    return []
  }

  private summarise(coin: string, events: { side: 'long' | 'short'; notional: number }[]): Signal | null {
    if (events.length === 0) return null
    const longNotional = events.filter(e => e.side === 'long').reduce((s, e) => s + e.notional, 0)
    const shortNotional = events.filter(e => e.side === 'short').reduce((s, e) => s + e.notional, 0)
    const total = longNotional + shortNotional
    const cascade = events.length >= CASCADE_COUNT
    const fmt = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    return {
      source: this.id,
      type: 'microstructure',
      content:
        `${coin} liquidations (rolling window): ${total > 0 ? fmt(total) : '$0'} total — ` +
        `${fmt(longNotional)} longs, ${fmt(shortNotional)} shorts across ${events.length} events` +
        (cascade ? ' — cascade in progress' : ''),
      timestamp: new Date(),
      coins: [coin],
      raw: { longNotional, shortNotional, count: events.length, cascade },
    }
  }
}

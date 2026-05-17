import type { Signal } from '../../common'
import type { DataSource } from './base'

interface PremiumIndexResponse {
  symbol: string
  lastFundingRate: string
  nextFundingTime: number
  markPrice: string
}

interface OpenInterestResponse {
  symbol: string
  openInterest: string
  time: number
}

/** A depth response level is a [price, quantity] string pair. */
interface DepthResponse {
  bids: [string, string][]
  asks: [string, string][]
}

/** Order-book depth levels per side to sum for the imbalance ratio. */
const DEPTH_LEVELS = 20

/**
 * Pulls perpetual-futures microstructure from the Binance USD-M futures REST
 * API: the current funding rate and open interest for each traded coin.
 * Funding and OI are far stronger short-horizon signals for crypto than
 * headline news. Every request degrades to no signal on error — a failed
 * fetch never throws into the pipeline.
 */
export class BinanceFuturesSource implements DataSource {
  readonly id = 'binance-futures'
  private readonly baseUrl = 'https://fapi.binance.com'

  constructor(private readonly coins: string[]) {}

  async fetch(): Promise<Signal[]> {
    const results = await Promise.allSettled(this.coins.map(coin => this.fetchForCoin(coin)))
    return results
      .filter((r): r is PromiseFulfilledResult<Signal[]> => r.status === 'fulfilled')
      .flatMap(r => r.value)
  }

  /**
   * Funding and open interest are point-in-time microstructure readings;
   * historical backfill is out of scope for this source.
   */
  async fetchHistorical(_from: Date, _to: Date): Promise<Signal[]> {
    return []
  }

  /** Binance futures symbols drop the slash: BTC/USDT → BTCUSDT. */
  private toSymbol(coin: string): string {
    return coin.replace('/', '')
  }

  private async fetchForCoin(coin: string): Promise<Signal[]> {
    const [funding, openInterest, depth] = await Promise.all([
      this.fetchFunding(coin),
      this.fetchOpenInterest(coin),
      this.fetchDepth(coin),
    ])
    return [funding, openInterest, depth].filter((s): s is Signal => s !== null)
  }

  private async fetchFunding(coin: string): Promise<Signal | null> {
    try {
      const res = await fetch(`${this.baseUrl}/fapi/v1/premiumIndex?symbol=${this.toSymbol(coin)}`)
      if (!res.ok) return null
      const body = (await res.json()) as PremiumIndexResponse
      const rate = Number(body.lastFundingRate)
      if (!Number.isFinite(rate)) return null
      const lean = rate > 0 ? 'longs pay shorts' : rate < 0 ? 'shorts pay longs' : 'neutral'
      return {
        source: this.id,
        type: 'microstructure',
        content: `${coin} funding rate: ${(rate * 100).toFixed(4)}% (${lean})`,
        timestamp: new Date(),
        coins: [coin],
        raw: body,
      }
    } catch {
      return null
    }
  }

  /** Sums the quantity column of order-book levels. */
  private sumQty(levels: [string, string][]): number {
    return levels.reduce((total, [, qty]) => total + (Number(qty) || 0), 0)
  }

  private async fetchDepth(coin: string): Promise<Signal | null> {
    try {
      const res = await fetch(`${this.baseUrl}/fapi/v1/depth?symbol=${this.toSymbol(coin)}&limit=${DEPTH_LEVELS}`)
      if (!res.ok) return null
      const body = (await res.json()) as DepthResponse
      if (!Array.isArray(body.bids) || !Array.isArray(body.asks)) return null
      const bidVol = this.sumQty(body.bids)
      const askVol = this.sumQty(body.asks)
      const total = bidVol + askVol
      if (total <= 0) return null
      const bidShare = bidVol / total
      const lean =
        bidShare > 0.58 ? 'bid-heavy (buy pressure)'
          : bidShare < 0.42 ? 'ask-heavy (sell pressure)'
            : 'balanced'
      return {
        source: this.id,
        type: 'microstructure',
        content: `${coin} order book: ${(bidShare * 100).toFixed(1)}% bids in top ${DEPTH_LEVELS} levels — ${lean}`,
        timestamp: new Date(),
        coins: [coin],
        raw: body,
      }
    } catch {
      return null
    }
  }

  private async fetchOpenInterest(coin: string): Promise<Signal | null> {
    try {
      const res = await fetch(`${this.baseUrl}/fapi/v1/openInterest?symbol=${this.toSymbol(coin)}`)
      if (!res.ok) return null
      const body = (await res.json()) as OpenInterestResponse
      const oi = Number(body.openInterest)
      if (!Number.isFinite(oi)) return null
      const base = coin.split('/')[0]
      return {
        source: this.id,
        type: 'microstructure',
        content: `${coin} open interest: ${oi.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${base}`,
        timestamp: body.time ? new Date(body.time) : new Date(),
        coins: [coin],
        raw: body,
      }
    } catch {
      return null
    }
  }
}

import type { Signal } from '@trader/shared'
import type { DataSource } from './base.js'

const COIN_KEYWORDS: Record<string, string> = {
  bitcoin: 'BTC/USDT', btc: 'BTC/USDT',
  ethereum: 'ETH/USDT', eth: 'ETH/USDT',
  solana: 'SOL/USDT', sol: 'SOL/USDT',
  bnb: 'BNB/USDT',
  xrp: 'XRP/USDT', ripple: 'XRP/USDT',
  cardano: 'ADA/USDT', ada: 'ADA/USDT',
  dogecoin: 'DOGE/USDT', doge: 'DOGE/USDT',
  avax: 'AVAX/USDT', avalanche: 'AVAX/USDT',
  polygon: 'MATIC/USDT', matic: 'MATIC/USDT',
  link: 'LINK/USDT', chainlink: 'LINK/USDT',
}

const DEFAULT_FEEDS = [
  'https://www.coindesk.com/arc/outboundfeeds/rss/',
  'https://cointelegraph.com/rss',
]

interface RssNewsConfig {
  feeds?: string[]
  maxItemsPerFeed?: number
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))
  return (m?.[1] ?? m?.[2] ?? '').trim()
}

function extractItems(xml: string): string[] {
  const items: string[] = []
  const re = /<item>([\s\S]*?)<\/item>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) items.push(m[1])
  return items
}

function coinsFromText(text: string): string[] {
  const lower = text.toLowerCase()
  const found = new Set<string>()
  for (const [kw, pair] of Object.entries(COIN_KEYWORDS)) {
    if (lower.includes(kw)) found.add(pair)
  }
  return [...found]
}

export class RssNewsSource implements DataSource {
  readonly id = 'rss-news'
  private readonly feeds: string[]
  private readonly maxItemsPerFeed: number

  constructor(config: RssNewsConfig = {}) {
    this.feeds = config.feeds ?? DEFAULT_FEEDS
    this.maxItemsPerFeed = config.maxItemsPerFeed ?? 20
  }

  async fetch(): Promise<Signal[]> {
    const results = await Promise.allSettled(this.feeds.map(f => this.fetchFeed(f)))
    return results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
  }

  async fetchHistorical(from: Date, to: Date): Promise<Signal[]> {
    const all = await this.fetch()
    return all.filter(s => s.timestamp >= from && s.timestamp <= to)
  }

  private async fetchFeed(url: string): Promise<Signal[]> {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'trader-bot/1.0' } })
      if (!res.ok) return []
      const xml = await res.text()
      return extractItems(xml)
        .slice(0, this.maxItemsPerFeed)
        .map(item => this.toSignal(item))
        .filter((s): s is Signal => s !== null)
    } catch {
      return []
    }
  }

  private toSignal(item: string): Signal | null {
    const title = extractTag(item, 'title')
    const pubDate = extractTag(item, 'pubDate')
    if (!title) return null

    const timestamp = pubDate ? new Date(pubDate) : new Date()
    if (isNaN(timestamp.getTime())) return null

    return {
      source: this.id,
      type: 'news',
      content: title,
      timestamp,
      coins: coinsFromText(title),
      raw: { title, pubDate },
    }
  }
}

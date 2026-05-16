import type { Signal } from '../../common'
import type { DataSource } from './base'

interface CryptoPanicPost {
  title: string
  published_at: string
  currencies: Array<{ code: string }>
  url: string
}

interface CryptoPanicResponse {
  results: CryptoPanicPost[]
}

interface CryptoPanicConfig {
  apiToken: string
}

export class CryptoPanicSource implements DataSource {
  readonly id = 'cryptopanic'
  private readonly apiToken: string
  private readonly baseUrl = 'https://cryptopanic.com/api/v1/posts'

  constructor(config: CryptoPanicConfig) {
    this.apiToken = config.apiToken
  }

  async fetch(): Promise<Signal[]> {
    try {
      const url = `${this.baseUrl}/?auth_token=${this.apiToken}&public=true`
      const res = await fetch(url)
      if (!res.ok) return []
      const body = (await res.json()) as CryptoPanicResponse
      return body.results.map(p => this.toSignal(p))
    } catch {
      return []
    }
  }

  async fetchHistorical(from: Date, to: Date): Promise<Signal[]> {
    try {
      const url = `${this.baseUrl}/?auth_token=${this.apiToken}&public=true&published_after=${from.toISOString()}&published_before=${to.toISOString()}`
      const res = await fetch(url)
      if (!res.ok) return []
      const body = (await res.json()) as CryptoPanicResponse
      return body.results.map(p => this.toSignal(p))
    } catch {
      return []
    }
  }

  private toSignal(post: CryptoPanicPost): Signal {
    const coins = post.currencies.map(c => `${c.code}/USDT`)
    return {
      source: this.id,
      type: 'news',
      content: post.title,
      timestamp: new Date(post.published_at),
      coins,
      raw: post,
    }
  }
}

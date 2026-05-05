'use server'

import { BacktestRunner } from '@trader/backtest'
import { candleRepository } from '@trader/db'
import { ClaudeAdapter } from '@trader/llm'
import type { BacktestResult } from '@trader/backtest'
import type { Candle } from '@trader/shared'

function requireField(formData: FormData, field: string): string {
  const value = formData.get(field)
  if (!value || typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required field: ${field}`)
  }
  return value.trim()
}

export async function runBacktest(formData: FormData): Promise<BacktestResult> {
  const fromStr = requireField(formData, 'from')
  const toStr = requireField(formData, 'to')
  const initialCapital = Number(formData.get('initialCapital') ?? '1000')
  const coinsRaw = formData.get('coins')
  const coins = typeof coinsRaw === 'string' && coinsRaw.trim()
    ? coinsRaw.split(',').map(c => c.trim())
    : ['BTC/USDT', 'ETH/USDT']
  const model = (formData.get('model') as string | null) ?? 'claude-haiku-4-5'

  const from = new Date(fromStr)
  const to = new Date(toStr)

  // Load historical candles from DB for each coin (default timeframe: 1h)
  const ohlcv: Record<string, Candle[]> = {}
  await Promise.all(
    coins.map(async coin => {
      ohlcv[coin] = await candleRepository.findCandles(coin, '1h', from, to)
    })
  )

  const anthropicApiKey = process.env['ANTHROPIC_API_KEY']
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required')
  }

  const adapter = new ClaudeAdapter({ apiKey: anthropicApiKey, model })

  // NullDataSource inline — no historical signals needed for backtest using DB candles
  const nullSource = { fetchHistorical: async () => [] }

  const runner = new BacktestRunner({
    from,
    to,
    initialCapital,
    autoTradeLimit: 50,
    coins,
    sources: [nullSource],
    ohlcv,
    adapter,
  })
  return runner.run()
}

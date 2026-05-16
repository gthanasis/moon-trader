'use server'

import { BacktestRunner } from '@trader/backtest'
import { candleRepository, getPrismaClient } from '@trader/db'
import { ClaudeAdapter, OpenAIAdapter } from '@trader/llm'
import { NullDataSource } from '@trader/data'
import type { BacktestResult } from '@trader/backtest'
import type { Candle } from '@trader/shared'

export async function getCandleDateRange(): Promise<{ from: string; to: string } | null> {
  const prisma = getPrismaClient()
  const [first, last] = await Promise.all([
    prisma.candle.findFirst({ orderBy: { timestamp: 'asc' }, select: { timestamp: true } }),
    prisma.candle.findFirst({ orderBy: { timestamp: 'desc' }, select: { timestamp: true } }),
  ])
  if (!first || !last) return null
  return {
    from: first.timestamp.toISOString().slice(0, 10),
    to: last.timestamp.toISOString().slice(0, 10),
  }
}

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
    ? coinsRaw.split(',').map(c => c.trim()).filter(Boolean)
    : ['BTC/USDT', 'ETH/USDT']
  const model = (formData.get('model') as string | null) ?? 'gpt-4o-mini'
  const intervalMs = Number(formData.get('intervalMs') ?? String(60 * 60 * 1000))

  const from = new Date(fromStr)
  const to = new Date(toStr)

  if (isNaN(from.getTime()) || isNaN(to.getTime())) throw new Error('Invalid date range')
  if (from >= to) throw new Error('from must be before to')
  if (!Number.isFinite(initialCapital) || initialCapital <= 0) throw new Error('Invalid initial capital')
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error('Invalid interval')
  if (coins.length === 0 || coins.length > 10) throw new Error('Coins must be 1–10 symbols')

  // Candle timeframe is always '1h' — data granularity is independent of decision interval.
  const lookbackFrom = new Date(from.getTime() - 30 * 24 * 60 * 60 * 1000)
  const ohlcv: Record<string, Candle[]> = {}
  await Promise.all(
    coins.map(async coin => {
      ohlcv[coin] = await candleRepository.findCandles(coin, '1h', lookbackFrom, to)
    })
  )

  const llmProvider = process.env['LLM_PROVIDER'] ?? 'openai'
  const llmApiKey = llmProvider === 'openai'
    ? process.env['OPENAI_API_KEY']
    : process.env['ANTHROPIC_API_KEY']

  if (!llmApiKey) {
    throw new Error(`${llmProvider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'} environment variable is required`)
  }

  const adapter = llmProvider === 'openai'
    ? new OpenAIAdapter({ apiKey: llmApiKey, model })
    : new ClaudeAdapter({ apiKey: llmApiKey, model })

  const runner = new BacktestRunner({
    from,
    to,
    initialCapital,
    autoTradeLimit: initialCapital,
    coins,
    sources: [new NullDataSource()],
    ohlcv,
    adapter,
    intervalMs,
  })
  return runner.run()
}

import { candleRepository, backtestRunRepository, type StepDecision } from '@trader/db'
import { OpenAIAdapter, ClaudeAdapter } from '@trader/llm'
import { NullDataSource } from '@trader/data'
import { BacktestRunner, type BacktestResult } from '@trader/backtest'
import type { LLMDecision, Candle } from '@trader/shared'

const encoder = new TextEncoder()

function sseEvent(data: object): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
}

function sseHeaders(): ResponseInit {
  return {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  }
}

function errorSseResponse(message: string): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(sseEvent({ type: 'error', message }))
      controller.close()
    },
  })
  return new Response(stream, sseHeaders())
}


type ParseResult =
  | { ok: true; from: Date; to: Date; initialCapital: number; coins: string[]; model: string; intervalMs: number }
  | { ok: false; error: string }

function parseParams(searchParams: URLSearchParams): ParseResult {
  const fromStr = searchParams.get('from')
  const toStr = searchParams.get('to')
  if (!fromStr || !toStr) return { ok: false, error: 'Missing required params: from, to' }

  const from = new Date(fromStr)
  const to = new Date(toStr)
  if (isNaN(from.getTime())) return { ok: false, error: 'Invalid date: from' }
  if (isNaN(to.getTime())) return { ok: false, error: 'Invalid date: to' }
  if (from >= to) return { ok: false, error: 'from must be before to' }

  const initialCapital = Number(searchParams.get('initialCapital') ?? '1000')
  if (!Number.isFinite(initialCapital) || initialCapital <= 0) {
    return { ok: false, error: 'initialCapital must be a positive finite number' }
  }

  const intervalMs = Number(searchParams.get('intervalMs') ?? String(60 * 60 * 1000))
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return { ok: false, error: 'intervalMs must be a positive finite number' }
  }

  const coinsRaw = searchParams.get('coins')
  const coins =
    typeof coinsRaw === 'string' && coinsRaw.trim()
      ? coinsRaw.split(',').map(c => c.trim()).filter(Boolean)
      : ['BTC/USDT', 'ETH/USDT']
  if (coins.length === 0) return { ok: false, error: 'At least one coin required' }
  if (coins.length > 10) return { ok: false, error: 'Too many coins (max 10)' }

  const model = searchParams.get('model') ?? 'gpt-4o-mini'
  if (!model || model.length > 100) return { ok: false, error: 'Invalid model name' }

  return { ok: true, from, to, initialCapital, coins, model, intervalMs }
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const params = parseParams(searchParams)
  if (!params.ok) return errorSseResponse(params.error)

  const { from, to, initialCapital, coins, model, intervalMs } = params
  // Candle timeframe is always '1h' — it controls data granularity, not decision frequency.
  // intervalMs controls how often the LLM runs; candles are always loaded at 1h resolution
  // since that is the canonical historical format stored in the DB.
  const candleTimeframe = '1h'

  let runId: string | undefined
  let runner: import('@trader/backtest').BacktestRunner | undefined
  let completed = false
  let decisions: StepDecision[] = []

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const lookbackFrom = new Date(from.getTime() - 30 * 24 * 60 * 60 * 1000)
        const ohlcv: Record<string, Candle[]> = {}
        await Promise.all(
          coins.map(async coin => {
            ohlcv[coin] = await candleRepository.findCandles(coin, candleTimeframe, lookbackFrom, to)
            console.log(`[backtest] ${coin}: ${ohlcv[coin].length} candles @ ${candleTimeframe} (${lookbackFrom.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)})`)
          }),
        )

        const llmProvider = process.env['LLM_PROVIDER'] ?? 'openai'
        const llmApiKey =
          llmProvider === 'openai'
            ? process.env['OPENAI_API_KEY']
            : process.env['ANTHROPIC_API_KEY']

        if (!llmApiKey) {
          controller.enqueue(sseEvent({ type: 'error', message: `Missing API key for provider: ${llmProvider}` }))
          controller.close()
          return
        }

        const adapter =
          llmProvider === 'openai'
            ? new OpenAIAdapter({ apiKey: llmApiKey, model })
            : new ClaudeAdapter({ apiKey: llmApiKey, model })

        runId = await backtestRunRepository.create({ from, to, coins, model, intervalMs, initialCapital })
        controller.enqueue(sseEvent({ type: 'run_created', runId }))

        runner = new BacktestRunner({
          from,
          to,
          initialCapital,
          autoTradeLimit: initialCapital,
          coins,
          sources: [new NullDataSource()],
          ohlcv,
          adapter,
          intervalMs,
          async onStep(step: number, total: number, timestamp: Date, decision: LLMDecision) {
            decisions.push({
              timestamp: timestamp.toISOString(),
              action: decision.action,
              coin: decision.coin,
              size: decision.size,
              confidence: decision.confidence,
              reasoning: decision.reasoning,
            })
            try {
              controller.enqueue(
                sseEvent({
                  type: 'step',
                  step,
                  total,
                  timestamp: timestamp.toISOString(),
                  decision: {
                    action: decision.action,
                    coin: decision.coin,
                    size: decision.size,
                    confidence: decision.confidence,
                    reasoning: decision.reasoning,
                  },
                }),
              )
            } catch { /* client disconnected — runner will cancel shortly */ }
          },
        })

        const result: BacktestResult = await runner.run()
        if (runner.wasCancelled && runId) {
          await backtestRunRepository.cancel(runId, result, decisions)
          return
        }
        await backtestRunRepository.complete(runId, result, decisions)
        completed = true
        // Client may have disconnected after the run finished — data is saved, so ignore controller errors.
        try {
          controller.enqueue(sseEvent({ type: 'result', result }))
          controller.close()
        } catch { /* already disconnected */ }
      } catch (err) {
        if (completed) return
        const message = err instanceof Error ? err.message : 'Unknown error'
        if (runId) await backtestRunRepository.fail(runId, message)
        try {
          controller.enqueue(sseEvent({ type: 'error', message }))
          controller.close()
        } catch { /* already disconnected */ }
      }
    },
    cancel() {
      runner?.cancel()
    },
  })

  return new Response(stream, sseHeaders())
}

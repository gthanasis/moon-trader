import { Injectable, type MessageEvent } from '@nestjs/common'
import { Observable } from 'rxjs'
import { OpenAIAdapter, ClaudeAdapter, type CycleResult } from '../llm'
import { NullDataSource } from '../market-data'
import { BacktestRunner } from './backtest-runner'
import type { Candle } from '../common'
import { CandleRepository } from '../prisma/repositories/candle.repository'
import {
  BacktestRunRepository,
  type StepDecision,
} from '../prisma/repositories/backtest-run.repository'
import { PrismaService } from '../prisma/prisma.service'

/** Validated backtest parameters, parsed from an HTTP query. */
export interface BacktestParams {
  from: Date
  to: Date
  initialCapital: number
  coins: string[]
  model: string
  intervalMs: number
}

type ParseResult = { ok: true; params: BacktestParams } | { ok: false; error: string }

/**
 * Backtest orchestration: parameter parsing, candle loading, adapter selection,
 * and running the BacktestRunner. `stream()` exposes live progress as an
 * Observable for the SSE controller; client disconnect cancels the run.
 */
@Injectable()
export class BacktestService {
  constructor(
    private readonly candles: CandleRepository,
    private readonly runs: BacktestRunRepository,
    private readonly prisma: PrismaService,
  ) {}

  /** Earliest and latest candle dates (YYYY-MM-DD), or null when no candles exist. */
  async getCandleDateRange(): Promise<{ from: string; to: string } | null> {
    const [first, last] = await Promise.all([
      this.prisma.candle.findFirst({ orderBy: { timestamp: 'asc' }, select: { timestamp: true } }),
      this.prisma.candle.findFirst({ orderBy: { timestamp: 'desc' }, select: { timestamp: true } }),
    ])
    if (!first || !last) return null
    return {
      from: first.timestamp.toISOString().slice(0, 10),
      to: last.timestamp.toISOString().slice(0, 10),
    }
  }

  /** Parses and validates raw query params into a BacktestParams. */
  parseParams(query: Record<string, string | undefined>): ParseResult {
    const { from: fromStr, to: toStr } = query
    if (!fromStr || !toStr) return { ok: false, error: 'Missing required params: from, to' }

    const from = new Date(fromStr)
    const to = new Date(toStr)
    if (isNaN(from.getTime())) return { ok: false, error: 'Invalid date: from' }
    if (isNaN(to.getTime())) return { ok: false, error: 'Invalid date: to' }
    if (from >= to) return { ok: false, error: 'from must be before to' }

    const initialCapital = Number(query['initialCapital'] ?? '1000')
    if (!Number.isFinite(initialCapital) || initialCapital <= 0) {
      return { ok: false, error: 'initialCapital must be a positive finite number' }
    }

    const intervalMs = Number(query['intervalMs'] ?? String(60 * 60 * 1000))
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      return { ok: false, error: 'intervalMs must be a positive finite number' }
    }

    const coinsRaw = query['coins']
    const coins =
      typeof coinsRaw === 'string' && coinsRaw.trim()
        ? coinsRaw.split(',').map(c => c.trim()).filter(Boolean)
        : ['BTC/USDT', 'ETH/USDT']
    if (coins.length === 0) return { ok: false, error: 'At least one coin required' }
    if (coins.length > 10) return { ok: false, error: 'Too many coins (max 10)' }

    const model = query['model'] ?? 'gpt-4o-mini'
    if (!model || model.length > 100) return { ok: false, error: 'Invalid model name' }

    return { ok: true, params: { from, to, initialCapital, coins, model, intervalMs } }
  }

  /** Loads candles (always 1h, with a 30-day lookback) for the given coins. */
  private async loadOhlcv(coins: string[], from: Date, to: Date): Promise<Record<string, Candle[]>> {
    const lookbackFrom = new Date(from.getTime() - 30 * 24 * 60 * 60 * 1000)
    const ohlcv: Record<string, Candle[]> = {}
    await Promise.all(
      coins.map(async coin => {
        ohlcv[coin] = await this.candles.findCandles(coin, '1h', lookbackFrom, to)
      }),
    )
    return ohlcv
  }

  /** Selects an LLM adapter from LLM_PROVIDER / API-key env vars. */
  private buildAdapter(model: string): OpenAIAdapter | ClaudeAdapter {
    const provider = process.env['LLM_PROVIDER'] ?? 'openai'
    const apiKey =
      provider === 'openai' ? process.env['OPENAI_API_KEY'] : process.env['ANTHROPIC_API_KEY']
    if (!apiKey) {
      throw new Error(`Missing API key for provider: ${provider}`)
    }
    return provider === 'openai'
      ? new OpenAIAdapter({ apiKey, model })
      : new ClaudeAdapter({ apiKey, model })
  }

  /** Runs a backtest to completion without persistence — returns the result. */
  async run(params: BacktestParams): Promise<unknown> {
    const ohlcv = await this.loadOhlcv(params.coins, params.from, params.to)
    const runner = new BacktestRunner({
      from: params.from,
      to: params.to,
      initialCapital: params.initialCapital,
      autoTradeLimit: params.initialCapital,
      coins: params.coins,
      sources: [new NullDataSource()],
      ohlcv,
      adapter: this.buildAdapter(params.model),
      intervalMs: params.intervalMs,
    })
    return runner.run()
  }

  /**
   * Runs a backtest, persisting the run and emitting SSE progress events.
   * Unsubscribing (client disconnect) cancels the run.
   */
  stream(params: BacktestParams): Observable<MessageEvent> {
    return new Observable<MessageEvent>(subscriber => {
      let runner: BacktestRunner | undefined
      let completed = false
      const decisions: StepDecision[] = []

      void (async () => {
        let runId: string | undefined
        try {
          const ohlcv = await this.loadOhlcv(params.coins, params.from, params.to)
          const adapter = this.buildAdapter(params.model)

          runId = await this.runs.create({
            from: params.from,
            to: params.to,
            coins: params.coins,
            model: params.model,
            intervalMs: params.intervalMs,
            initialCapital: params.initialCapital,
          })
          subscriber.next({ data: { type: 'run_created', runId } })

          runner = new BacktestRunner({
            from: params.from,
            to: params.to,
            initialCapital: params.initialCapital,
            autoTradeLimit: params.initialCapital,
            coins: params.coins,
            sources: [new NullDataSource()],
            ohlcv,
            adapter,
            intervalMs: params.intervalMs,
            onStep: (step: number, total: number, timestamp: Date, cycleResult: CycleResult) => {
              const { decision, executedDecision, executed, reason } = cycleResult
              const blockedReason = !executed && decision.action !== 'hold' ? reason : undefined
              const executedSize =
                executed && executedDecision.size !== decision.size ? executedDecision.size : undefined
              const stepDecision: StepDecision = {
                timestamp: timestamp.toISOString(),
                action: decision.action,
                coin: decision.coin,
                size: decision.size,
                confidence: decision.confidence,
                reasoning: decision.reasoning,
                executed,
                ...(blockedReason !== undefined && { blockedReason }),
                ...(executedSize !== undefined && { executedSize }),
              }
              decisions.push(stepDecision)
              subscriber.next({
                data: { type: 'step', step, total, timestamp: timestamp.toISOString(), decision: stepDecision },
              })
            },
          })

          const result = await runner.run()
          if (runner.wasCancelled && runId) {
            await this.runs.cancel(runId, result, decisions)
            subscriber.complete()
            return
          }
          await this.runs.complete(runId, result, decisions)
          completed = true
          subscriber.next({ data: { type: 'result', result } })
          subscriber.complete()
        } catch (err) {
          if (completed) return
          const message = err instanceof Error ? err.message : 'Unknown error'
          if (runId) await this.runs.fail(runId, message)
          subscriber.next({ data: { type: 'error', message } })
          subscriber.complete()
        }
      })()

      // Teardown: client disconnected — cancel the run.
      return () => runner?.cancel()
    })
  }
}

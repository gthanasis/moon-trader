import ccxt from 'ccxt'
import { ClaudeAdapter, EvaluationCycle } from '@trader/llm'
import { TradingEngine, CcxtExchangeAdapter } from '@trader/core'
import { Pipeline, BinanceSource } from '@trader/data'
import { Scheduler } from './scheduler.js'
import type { LiveConfig } from './config.js'

export interface LiveTraderHandle {
  stop(): void
}

export function startLiveTrader(config: LiveConfig): LiveTraderHandle {
  const binanceExchange = new ccxt.binance({
    apiKey: config.binanceApiKey,
    secret: config.binanceSecret,
  })

  // ccxt's OHLCV type uses `Num` (number | undefined) but in practice values are always numbers;
  // cast to satisfy the narrower ExchangeLike interface expected by BinanceSource
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const binanceSource = new BinanceSource(binanceExchange as any)

  const pipeline = new Pipeline({
    sources: [],
    ohlcvSource: binanceSource,
    coins: config.coins,
    timeframe: config.timeframe,
    ohlcvLimit: config.ohlcvLimit,
  })

  const exchangeAdapter = config.paper ? undefined : new CcxtExchangeAdapter(binanceExchange)

  const engine = new TradingEngine({
    totalCapital: config.totalCapital,
    paper: config.paper,
    exchange: exchangeAdapter,
  })

  const llmAdapter = new ClaudeAdapter({ apiKey: config.anthropicApiKey })

  const cycle = new EvaluationCycle({
    pipeline,
    adapter: llmAdapter,
    engine,
    autoTradeLimit: config.autoTradeLimit,
  })

  const scheduler = new Scheduler(cycle, config.cronExpression)
  scheduler.start()

  console.log(
    `[LiveTrader] Started. paper=${config.paper}, coins=${config.coins.join(',')}, cron="${config.cronExpression}"`,
  )

  return { stop: () => scheduler.stop() }
}

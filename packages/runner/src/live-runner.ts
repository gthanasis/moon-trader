import { randomUUID } from 'crypto'
import { writeFileSync, unlinkSync } from 'fs'
import ccxt from 'ccxt'
import { ClaudeAdapter, OpenAIAdapter, EvaluationCycle } from '@trader/llm'
import { TradingEngine, CcxtExchangeAdapter } from '@trader/core'
import { Pipeline, BinanceSource, FearAndGreedSource, RssNewsSource } from '@trader/data'
import { getPrismaClient, TradeRepository, DecisionRepository, SignalRepository, CandleRepository } from '@trader/db'
import { startBot } from '@trader/bot'
import { Scheduler } from './scheduler.js'
import type { LiveConfig } from './config.js'

const PID_FILE = '.trader.pid'

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

  const sources = [
    new FearAndGreedSource(),
    new RssNewsSource(),
  ]

  const basePipeline = new Pipeline({
    sources,
    ohlcvSource: binanceSource,
    coins: config.coins,
    timeframe: config.timeframe,
    ohlcvLimit: config.ohlcvLimit,
  })

  const prisma = getPrismaClient()
  const tradeRepo = new TradeRepository(prisma)
  const decisionRepo = new DecisionRepository(prisma)
  const signalRepo = new SignalRepository(prisma)
  const candleRepo = new CandleRepository(prisma)

  const pipeline = {
    fetch: async () => {
      const snapshot = await basePipeline.fetch()
      if (snapshot.signals.length > 0) {
        await signalRepo.saveSignals(snapshot.signals).catch(err =>
          console.error('[LiveTrader] Failed to persist signals:', err)
        )
      }
      if (Object.keys(snapshot.ohlcv).length > 0) {
        await Promise.all(
          Object.entries(snapshot.ohlcv).map(([coin, candles]) =>
            candleRepo.saveCandles(coin, config.timeframe, candles)
          )
        ).catch(err => console.error('[LiveTrader] Failed to persist candles:', err))
      }
      return snapshot
    },
  }

  const exchangeAdapter = config.paper ? undefined : new CcxtExchangeAdapter(binanceExchange)

  const engine = new TradingEngine({
    totalCapital: config.totalCapital,
    paper: config.paper,
    exchange: exchangeAdapter,
    maxPositions: config.maxPositions,
    dailyLossLimitPct: config.dailyLossLimitPct,
    feeRate: config.feeRate,
    slippageBps: config.slippageBps,
    onPositionClosed: async ({ coin, fillPrice, pnl, reason }) => {
      try {
        const openTrade = await tradeRepo.findOpenTradeByCoin(coin)
        if (openTrade) {
          await tradeRepo.closeTrade(openTrade.id, { exitPrice: fillPrice, closedAt: new Date(), pnl })
          console.log(`[LiveTrader] Closed ${coin} trade ${openTrade.id} via ${reason}: fillPrice=${fillPrice} pnl=${pnl.toFixed(2)}`)
        }
      } catch (err) {
        console.error('[LiveTrader] Failed to persist position close:', err)
      }
    },
  })

  const llmAdapter =
    config.llmProvider === 'openai'
      ? new OpenAIAdapter({ apiKey: config.llmApiKey })
      : new ClaudeAdapter({ apiKey: config.llmApiKey })

  // Start Telegram bot if configured
  const botHandle =
    config.telegramBotToken && config.telegramChatId
      ? startBot({
          botToken: config.telegramBotToken,
          chatId: config.telegramChatId,
        })
      : undefined

  const { notifier, approvalManager } = botHandle ?? {}

  const cycle = new EvaluationCycle({
    pipeline,
    adapter: llmAdapter,
    engine,
    autoTradeLimit: config.autoTradeLimit,
    riskPerTradePct: config.riskPerTradePct,
    minConfidence: config.minConfidence,
    getRecentTrades: () => tradeRepo.findRecentTrades(5),
    notifier,
    onApprovalNeeded: approvalManager
      ? async decision => {
          const result = await approvalManager.requestApproval(decision)
          return result === 'approved'
        }
      : undefined,
  })

  const persistingCycle = {
    run: async () => {
      const result = await cycle.run()
      const status = result.executed ? 'executed' : 'blocked'
      console.log(`[Cycle] ${new Date().toISOString()} — ${result.decision.action.toUpperCase()} ${result.decision.coin} confidence=${result.decision.confidence.toFixed(2)} ${status} ${result.reason ?? ''}`.trimEnd())

      // Persist the LLM's raw decision with its actual execution status.
      const decisionId = await decisionRepo.saveDecision(result.decision, status).catch(err => {
        console.error('[LiveTrader] Failed to persist decision:', err)
        return null
      })

      // Persist a new open trade row when a buy fills.
      // Sells and stop/TP exits are persisted via engine.onPositionClosed (fires immediately on close).
      if (result.executed && result.executedDecision.action === 'buy' && decisionId) {
        const position = engine.getPositions().find(p => p.coin === result.executedDecision.coin)
        const trade = {
          id: randomUUID(),
          coin: result.executedDecision.coin,
          side: 'buy' as const,
          size: position?.size ?? result.executedDecision.size,
          entryPrice: position?.entryPrice ?? 0,
          openedAt: new Date(),
          reasoning: result.decision.reasoning,
        }
        await tradeRepo.saveTrade(trade, config.paper ? 'paper' : 'live').catch(err => {
          console.error('[LiveTrader] Failed to persist trade:', err)
        })
        await decisionRepo.linkDecisionToTrade(decisionId, trade.id).catch(err => {
          console.error('[LiveTrader] Failed to link decision to trade:', err)
        })
      }

      return result
    },
  }
  const scheduler = new Scheduler(persistingCycle, config.cronExpression)
  scheduler.start()

  try { writeFileSync(PID_FILE, String(process.pid)) } catch { /* ignore */ }

  console.log(
    `[LiveTrader] Started. PID=${process.pid} paper=${config.paper}, coins=${config.coins.join(',')}, cron="${config.cronExpression}"`,
    botHandle ? '| Telegram bot active' : '| Telegram bot disabled',
  )
  console.log(`[LiveTrader] To stop: kill $(cat ${PID_FILE})  — or send SIGTERM/SIGINT`)

  return {
    stop: () => {
      scheduler.stop()
      botHandle?.stop()
      try { unlinkSync(PID_FILE) } catch { /* ignore */ }
    },
  }
}

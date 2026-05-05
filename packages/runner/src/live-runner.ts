import { randomUUID } from 'crypto'
import ccxt from 'ccxt'
import { ClaudeAdapter, EvaluationCycle } from '@trader/llm'
import { TradingEngine, CcxtExchangeAdapter } from '@trader/core'
import { Pipeline, BinanceSource } from '@trader/data'
import { getPrismaClient, TradeRepository, DecisionRepository } from '@trader/db'
import { startBot } from '@trader/bot'
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
    notifier,
    onApprovalNeeded: approvalManager
      ? async decision => {
          const result = await approvalManager.requestApproval(decision)
          return result === 'approved'
        }
      : undefined,
  })

  const prisma = getPrismaClient()
  const tradeRepo = new TradeRepository(prisma)
  const decisionRepo = new DecisionRepository(prisma)

  const persistingCycle = {
    run: async () => {
      const result = await cycle.run()

      const decisionId = await decisionRepo.saveDecision(result.decision).catch(err => {
        console.error('[LiveTrader] Failed to persist decision:', err)
        return null
      })

      if (result.executed && result.decision.action === 'buy' && decisionId) {
        const position = engine.getPositions().find(p => p.coin === result.decision.coin)
        const trade = {
          id: randomUUID(),
          coin: result.decision.coin,
          side: 'buy' as const,
          size: result.decision.size,
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

  console.log(
    `[LiveTrader] Started. paper=${config.paper}, coins=${config.coins.join(',')}, cron="${config.cronExpression}"`,
    botHandle ? '| Telegram bot active' : '| Telegram bot disabled',
  )

  return {
    stop: () => {
      scheduler.stop()
      botHandle?.stop()
    },
  }
}

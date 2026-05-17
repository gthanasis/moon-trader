import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common'
import type { Subscription } from 'rxjs'
import ccxt from 'ccxt'
import { ClaudeAdapter, OpenAIAdapter, EvaluationCycle } from '../llm'
import { TradingEngine, CcxtExchangeAdapter } from '../core'
import { Pipeline, BinanceSource, FearAndGreedSource, RssNewsSource } from '../market-data'
import { intervalToCron, type BotSettings } from '../common'
import { TradeRepository } from '../prisma/repositories/trade.repository'
import { DecisionRepository } from '../prisma/repositories/decision.repository'
import { SignalRepository } from '../prisma/repositories/signal.repository'
import { CandleRepository } from '../prisma/repositories/candle.repository'
import { BotStateRepository } from '../prisma/repositories/bot-state.repository'
import { NarrationRepository } from '../prisma/repositories/narration.repository'
import type { NarrationGranularity } from '../common'
import { SettingsService } from '../settings/settings.service'
import { TelegramService } from '../telegram/telegram.service'
import { EventsService } from '../events/events.service'
import { Scheduler } from './scheduler'
import { loadConfig, type LiveConfig } from './config'
import { runCycleWithPersistence } from './cycle-runner'

/**
 * The live trading loop, running inside the NestJS process. Replaces the
 * standalone `runner` package: builds the engine/pipeline/evaluation cycle on
 * module init, schedules cycles, and re-reads runtime settings every cycle so
 * web settings changes take effect without a restart.
 *
 * When restart-only config (Binance/LLM keys) is missing the loop stays
 * disabled and the rest of the API still serves HTTP.
 */
@Injectable()
export class TradingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TradingService.name)
  private scheduler?: Scheduler
  private engine?: TradingEngine
  private settingsSub?: Subscription

  constructor(
    private readonly tradeRepo: TradeRepository,
    private readonly decisionRepo: DecisionRepository,
    private readonly signalRepo: SignalRepository,
    private readonly candleRepo: CandleRepository,
    private readonly botState: BotStateRepository,
    private readonly narrationRepo: NarrationRepository,
    private readonly settings: SettingsService,
    private readonly telegram: TelegramService,
    private readonly events: EventsService,
  ) {}

  /**
   * Latest narration recap per time window, formatted for the `{narration*}`
   * prompt placeholders. A window with no narration yet is simply omitted —
   * prompt-builder renders a "no recap" line for it. Fails open per window.
   */
  private async loadNarrations(): Promise<Partial<Record<NarrationGranularity, string>>> {
    const windows: NarrationGranularity[] = ['6h', 'day', 'week', 'month']
    const out: Partial<Record<NarrationGranularity, string>> = {}
    await Promise.all(
      windows.map(async g => {
        try {
          const n = await this.narrationRepo.findLatest(g)
          if (n) {
            out[g] = n.assessment ? `${n.summary}\n\nAssessment: ${n.assessment}` : n.summary
          }
        } catch (err) {
          this.logger.warn(`Failed to load ${g} narration: ${String(err)}`)
        }
      }),
    )
    return out
  }

  onModuleInit(): void {
    let config: LiveConfig
    try {
      config = loadConfig()
    } catch (err) {
      this.logger.warn(`Trading loop disabled — ${(err as Error).message}`)
      return
    }
    this.start(config)
  }

  onModuleDestroy(): void {
    this.scheduler?.stop()
    this.settingsSub?.unsubscribe()
  }

  /** Test/web seam: the trading engine, once the loop has started. */
  getEngine(): TradingEngine | undefined {
    return this.engine
  }

  /**
   * The shared `paused` flag from BotState — set by the web toggle and the
   * Telegram /pause /resume commands. Fails open: a DB error must not halt
   * trading.
   */
  private async isBotPaused(): Promise<boolean> {
    try {
      return (await this.botState.get('paused')) === true
    } catch (err) {
      this.logger.error(`Failed to read paused flag — assuming not paused: ${String(err)}`)
      return false
    }
  }

  private start(config: LiveConfig): void {
    const binanceExchange = new ccxt.binance({
      apiKey: config.binanceApiKey,
      secret: config.binanceSecret,
    })

    // ccxt's OHLCV type is wider than BinanceSource's ExchangeLike; values are
    // numbers in practice.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const binanceSource = new BinanceSource(binanceExchange as any)

    const basePipeline = new Pipeline({
      sources: [new FearAndGreedSource(), new RssNewsSource()],
      ohlcvSource: binanceSource,
      coins: config.coins,
      timeframe: config.timeframe,
      ohlcvLimit: config.ohlcvLimit,
    })

    // Wrap the pipeline to persist signals and candles as a side effect.
    const pipeline = {
      fetch: async () => {
        const snapshot = await basePipeline.fetch()
        if (snapshot.signals.length > 0) {
          await this.signalRepo.saveSignals(snapshot.signals).catch(err =>
            this.logger.error(`Failed to persist signals: ${String(err)}`),
          )
          this.events.emit('signals_ingested', { count: snapshot.signals.length })
        }
        if (Object.keys(snapshot.ohlcv).length > 0) {
          await Promise.all(
            Object.entries(snapshot.ohlcv).map(([coin, candles]) =>
              this.candleRepo.saveCandles(coin, config.timeframe, candles),
            ),
          ).catch(err => this.logger.error(`Failed to persist candles: ${String(err)}`))
        }
        return snapshot
      },
    }

    // Always build the exchange adapter so the engine can switch into real
    // trading at runtime (web paper/real toggle). The adapter is inert until
    // an order is actually placed in real mode.
    const exchangeAdapter = new CcxtExchangeAdapter(binanceExchange)

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
          const openTrade = await this.tradeRepo.findOpenTradeByCoin(coin)
          if (openTrade) {
            await this.tradeRepo.closeTrade(openTrade.id, { exitPrice: fillPrice, closedAt: new Date(), pnl })
            this.logger.log(`Closed ${coin} trade ${openTrade.id} via ${reason}: fillPrice=${fillPrice} pnl=${pnl.toFixed(2)}`)
          }
          this.events.emit('trade_closed', { coin, fillPrice, pnl, reason })
        } catch (err) {
          this.logger.error(`Failed to persist position close: ${String(err)}`)
        }
      },
    })
    this.engine = engine

    const llmAdapter =
      config.llmProvider === 'openai'
        ? new OpenAIAdapter({ apiKey: config.llmApiKey })
        : new ClaudeAdapter({ apiKey: config.llmApiKey })

    const notifier = this.telegram.notifier
    const approvalManager = this.telegram.approvalManager

    const cycle = new EvaluationCycle({
      pipeline,
      adapter: llmAdapter,
      engine,
      autoTradeLimit: config.autoTradeLimit,
      riskPerTradePct: config.riskPerTradePct,
      minConfidence: config.minConfidence,
      getRecentTrades: () => this.tradeRepo.findRecentTrades(5),
      getNarrations: () => this.loadNarrations(),
      notifier,
      onApprovalNeeded: approvalManager
        ? async decision => (await approvalManager.requestApproval(decision)) === 'approved'
        : undefined,
    })

    // Re-read runtime-editable settings and apply them in place. Fails open.
    // `prev` lets us log only the fields that actually changed between cycles.
    let prev: BotSettings | undefined
    const applyRuntimeSettings = async (): Promise<void> => {
      try {
        const settings = await this.settings.get()
        if (prev) {
          const changed = (Object.keys(settings) as (keyof BotSettings)[])
            .filter(k => settings[k] !== prev![k])
            .map(k => `${k}: ${String(prev![k])} → ${String(settings[k])}`)
          if (changed.length > 0) {
            this.logger.log(`Runtime settings changed — ${changed.join(', ')}`)
          }
        }
        prev = settings
        engine.applySettings(settings)
        cycle.applySettings(settings)
        this.scheduler?.reschedule(intervalToCron(settings.runIntervalMinutes))
      } catch (err) {
        this.logger.error(`Failed to apply runtime settings — keeping current values: ${String(err)}`)
      }
    }

    const scheduler = new Scheduler(
      {
        run: async () => {
          await applyRuntimeSettings()
          this.events.emit('cycle_started')
          return runCycleWithPersistence(
            cycle, engine, this.decisionRepo, this.tradeRepo,
            () => this.isBotPaused(), this.logger, this.events,
          )
        },
      },
      config.cronExpression,
      this.logger,
    )
    this.scheduler = scheduler
    scheduler.start()
    // Apply persisted settings immediately so the first cycle and the schedule
    // reflect the web UI without waiting for an env-default-cadence tick.
    void applyRuntimeSettings()

    // Re-apply on every save so a changed run interval reschedules the cron at
    // once — otherwise it would only take effect after the next (old-cadence)
    // cycle, and the dashboard countdown would expire with nothing happening.
    this.settingsSub = this.events.stream().subscribe(event => {
      if (event.type === 'settings_changed') {
        this.logger.log('Settings changed — re-applying to the live loop')
        void applyRuntimeSettings()
      }
    })

    // paper here is the env seed; applyRuntimeSettings() below overrides it
    // with the persisted paperMode (defaults to paper/true) before cycle one.
    this.logger.log(
      `Trading loop started: paper=${config.paper} (env seed), coins=${config.coins.join(',')}, cron="${config.cronExpression}"` +
        (notifier ? ' | Telegram active' : ' | Telegram disabled'),
    )
  }
}

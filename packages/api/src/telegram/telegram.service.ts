import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Bot } from 'grammy'
import { BotNotifier } from './notifier'
import { ApprovalManager } from './approval-manager'
import { registerCommands } from './commands'
import { BotStateRepository } from '../prisma/repositories/bot-state.repository'

/**
 * Owns the Telegram bot lifecycle. Starts long-polling on module init when
 * TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are configured; otherwise no-ops so
 * the API runs fine without Telegram. TradingModule reads `notifier` and
 * `approvalManager` through this service.
 */
@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name)
  private bot?: Bot
  private _notifier?: BotNotifier
  private _approvalManager?: ApprovalManager

  constructor(
    private readonly config: ConfigService,
    private readonly botState: BotStateRepository,
  ) {}

  onModuleInit(): void {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN')
    const chatId = this.config.get<string>('TELEGRAM_CHAT_ID')
    if (!token || !chatId) {
      this.logger.log('Telegram disabled (TELEGRAM_BOT_TOKEN/CHAT_ID not set)')
      return
    }

    this.bot = new Bot(token)
    this._notifier = new BotNotifier(token, chatId)
    this._approvalManager = new ApprovalManager(token, chatId)
    registerCommands(this.bot, this.botState)

    // Long polling — non-blocking.
    void this.bot.start()
    this.logger.log('Telegram bot started (long polling)')
  }

  async onModuleDestroy(): Promise<void> {
    await this.bot?.stop()
  }

  /** Trade/cycle notification sender. Undefined when Telegram is disabled. */
  get notifier(): BotNotifier | undefined {
    return this._notifier
  }

  /** Manual trade-approval prompt manager. Undefined when Telegram is disabled. */
  get approvalManager(): ApprovalManager | undefined {
    return this._approvalManager
  }
}

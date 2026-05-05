import { Bot } from 'grammy'
import { BotNotifier } from './notifier.js'
import { ApprovalManager } from './approval-manager.js'
import { registerCommands } from './commands.js'

export interface BotConfig {
  botToken: string
  chatId: string
  approvalTimeoutMs?: number
}

export interface BotHandle {
  stop(): void
  notifier: BotNotifier
  approvalManager: ApprovalManager
}

export function startBot(config: BotConfig): BotHandle {
  const bot = new Bot(config.botToken)

  const notifier = new BotNotifier(config.botToken, config.chatId)
  const approvalManager = new ApprovalManager(config.botToken, config.chatId, {
    timeoutMs: config.approvalTimeoutMs,
  })

  registerCommands(bot)

  // Start long polling (non-blocking)
  void bot.start()

  return {
    stop: () => void bot.stop(),
    notifier,
    approvalManager,
  }
}

export { BotNotifier } from './notifier.js'
export { ApprovalManager } from './approval-manager.js'
export type { ApprovalResult } from './approval-manager.js'

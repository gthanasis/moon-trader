import { Bot, InlineKeyboard } from 'grammy'
import type { LLMDecision } from '@trader/shared'

export type ApprovalResult = 'approved' | 'rejected' | 'timeout'

interface PendingApproval {
  resolve: (result: ApprovalResult) => void
  timeout: ReturnType<typeof setTimeout>
}

interface ApprovalManagerConfig {
  timeoutMs?: number
}

export class ApprovalManager {
  private readonly bot: Bot
  private readonly chatId: string
  private readonly timeoutMs: number
  private readonly pending = new Map<string, PendingApproval>()
  // Buffer callbacks that arrive before the pending entry is registered
  private readonly earlyCallbacks = new Map<string, { data: string; answerCallbackQuery: () => Promise<unknown> }>()

  constructor(botToken: string, chatId: string, config: ApprovalManagerConfig = {}) {
    this.bot = new Bot(botToken)
    this.chatId = chatId
    this.timeoutMs = config.timeoutMs ?? 10 * 60 * 1000 // 10 minutes default

    this.bot.on('callback_query:data', async ctx => {
      const messageId = String(ctx.callbackQuery.message?.message_id)
      const entry = this.pending.get(messageId)

      if (!entry) {
        // Buffer for late-arriving pending entries (e.g. when sendMessage hasn't resolved yet)
        this.earlyCallbacks.set(messageId, {
          data: ctx.callbackQuery.data,
          answerCallbackQuery: () => ctx.answerCallbackQuery(),
        })
        return
      }

      clearTimeout(entry.timeout)
      this.pending.delete(messageId)

      const result: ApprovalResult = ctx.callbackQuery.data === 'approve' ? 'approved' : 'rejected'
      entry.resolve(result)
      await ctx.answerCallbackQuery()
    })
  }

  requestApproval(decision: LLMDecision): Promise<ApprovalResult> {
    const keyboard = new InlineKeyboard()
      .text('✅ Approve', 'approve')
      .text('❌ Reject', 'reject')

    const text =
      `🔔 APPROVAL NEEDED: ${decision.action.toUpperCase()} $${decision.size} of ${decision.coin}\n` +
      `Confidence: ${decision.confidence}\n` +
      `Reason: ${decision.reasoning}`

    return new Promise<ApprovalResult>((resolve, reject) => {
      // Set up the timeout before sending the message so it's always active.
      // We use a flag to track whether the pending entry has been registered yet;
      // if timeout fires before registration, we resolve directly.
      let registered = false
      let resolvedEarly = false

      const timeout = setTimeout(() => {
        if (resolvedEarly) return
        resolvedEarly = true
        if (registered) {
          // Normal path: pending entry exists, clean it up
          // (the key lookup is handled by finding the promise's resolve)
        }
        resolve('timeout')
      }, this.timeoutMs)

      this.bot.api
        .sendMessage(this.chatId, text, { reply_markup: keyboard })
        .then(message => {
          const key = String(message.message_id)

          // Check if a callback arrived before we registered this entry
          const early = this.earlyCallbacks.get(key)
          if (early) {
            this.earlyCallbacks.delete(key)
            clearTimeout(timeout)
            if (!resolvedEarly) {
              resolvedEarly = true
              const result: ApprovalResult = early.data === 'approve' ? 'approved' : 'rejected'
              resolve(result)
              void early.answerCallbackQuery()
            }
            return
          }

          // If timeout already fired, nothing to do
          if (resolvedEarly) {
            clearTimeout(timeout)
            return
          }

          registered = true

          // Wrap resolve to also clear timeout and remove from pending
          const wrappedResolve = (result: ApprovalResult) => {
            clearTimeout(timeout)
            this.pending.delete(key)
            if (!resolvedEarly) {
              resolvedEarly = true
              resolve(result)
            }
          }

          this.pending.set(key, { resolve: wrappedResolve, timeout })
        })
        .catch(err => {
          clearTimeout(timeout)
          reject(err)
        })
    })
  }
}

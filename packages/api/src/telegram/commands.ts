import type { Bot, Context } from 'grammy'
import type { Position } from '../common'
import type { BotStateRepository } from '../prisma/repositories/bot-state.repository'

/**
 * Registers the Telegram slash commands on the given bot.
 *
 * Every command is gated to `chatId` — the chat configured via
 * TELEGRAM_CHAT_ID. Messages from any other chat are silently ignored, so a
 * stranger who discovers the bot cannot pause/resume live trading or read
 * account state. `chatId` and the bot-state repository are passed in (the
 * latter was a module singleton in the old package).
 */
export function registerCommands(bot: Bot, botState: BotStateRepository, chatId: string): void {
  /** True only when the update originates from the configured chat. */
  const authorized = (ctx: Context): boolean => String(ctx.chat?.id) === chatId

  bot.command('pause', async ctx => {
    if (!authorized(ctx)) return
    await botState.set('paused', true)
    await ctx.reply('⏸️ Trading paused. Use /resume to restart.')
  })

  bot.command('resume', async ctx => {
    if (!authorized(ctx)) return
    await botState.set('paused', false)
    await ctx.reply('▶️ Trading resumed.')
  })

  bot.command('status', async ctx => {
    if (!authorized(ctx)) return
    const [rawPositions, rawPnl] = await Promise.all([
      botState.get('positions'),
      botState.get('totalPnl'),
    ])
    const positions = (rawPositions as Position[] | null) ?? []
    const pnl = (rawPnl as number | null) ?? 0

    await ctx.reply(
      `📊 Status\n` +
        `Open positions: ${positions.length}\n` +
        `Total P&L: $${pnl.toFixed(2)}`,
    )
  })

  bot.command('capital', async ctx => {
    if (!authorized(ctx)) return
    const [rawDeployed, rawTotal] = await Promise.all([
      botState.get('deployedCapital'),
      botState.get('totalCapital'),
    ])
    const deployed = (rawDeployed as number | null) ?? 0
    const total = (rawTotal as number | null) ?? 0
    const available = total - deployed
    const pct = total > 0 ? ((deployed / total) * 100).toFixed(1) : '0.0'

    await ctx.reply(
      `💰 Capital\n` +
        `Deployed: $${deployed} (${pct}%)\n` +
        `Available: $${available}\n` +
        `Total: $${total}`,
    )
  })
}

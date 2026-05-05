import type { Bot } from 'grammy'
import { botStateRepository } from '@trader/db'
import type { Position } from '@trader/shared'

export function registerCommands(bot: Bot): void {
  bot.command('pause', async ctx => {
    await botStateRepository.set('paused', true)
    await ctx.reply('⏸️ Trading paused. Use /resume to restart.')
  })

  bot.command('resume', async ctx => {
    await botStateRepository.set('paused', false)
    await ctx.reply('▶️ Trading resumed.')
  })

  bot.command('status', async ctx => {
    const [rawPositions, rawPnl] = await Promise.all([
      botStateRepository.get('positions'),
      botStateRepository.get('totalPnl'),
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
    const [rawDeployed, rawTotal] = await Promise.all([
      botStateRepository.get('deployedCapital'),
      botStateRepository.get('totalCapital'),
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

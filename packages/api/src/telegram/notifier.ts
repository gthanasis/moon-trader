import { Bot } from 'grammy'

export class BotNotifier {
  private readonly bot: Bot
  private readonly chatId: string

  constructor(botToken: string, chatId: string) {
    this.bot = new Bot(botToken)
    this.chatId = chatId
  }

  async tradeExecuted(trade: {
    coin: string
    side: 'buy' | 'sell'
    size: number
    fillPrice: number
    reasoning: string
  }): Promise<void> {
    const side = trade.side.toUpperCase()
    const text =
      `✅ AUTO-TRADE: ${side} $${trade.size} of ${trade.coin} @ ${trade.fillPrice}\n` +
      `Reason: ${trade.reasoning}`
    await this.bot.api.sendMessage(this.chatId, text)
  }

  async capitalAlert(deployed: number, total: number): Promise<void> {
    const pct = ((deployed / total) * 100).toFixed(1)
    const text =
      `⚠️ CAPITAL ALERT: ${pct}% deployed\n` +
      `Deployed: $${deployed} / Total: $${total}`
    await this.bot.api.sendMessage(this.chatId, text)
  }

  async cycleError(err: Error): Promise<void> {
    const text = `🚨 CYCLE ERROR: ${err.message}`
    await this.bot.api.sendMessage(this.chatId, text)
  }
}

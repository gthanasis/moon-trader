import { Body, Controller, Get, Put } from '@nestjs/common'
import { BotStateRepository } from '../prisma/repositories/bot-state.repository'

/**
 * The shared `paused` flag that gates the live trading loop. Written by the
 * web toggle and the Telegram /pause /resume commands.
 */
@Controller('bot')
export class BotController {
  constructor(private readonly botState: BotStateRepository) {}

  @Get('paused')
  async getPaused(): Promise<{ paused: boolean }> {
    return { paused: (await this.botState.get('paused')) === true }
  }

  @Put('paused')
  async setPaused(@Body() body: { paused: boolean }): Promise<{ paused: boolean }> {
    await this.botState.set('paused', body.paused === true)
    return { paused: body.paused === true }
  }
}

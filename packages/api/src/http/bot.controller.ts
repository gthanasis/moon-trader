import { BadRequestException, Body, Controller, Get, Param, Put } from '@nestjs/common'
import { BotStateRepository } from '../prisma/repositories/bot-state.repository'

/**
 * BotState keys the generic read endpoint is allowed to expose. Restricting to
 * an allowlist keeps `GET /bot/state/:key` from becoming an arbitrary read
 * primitive over whatever the trading loop persists.
 */
const READABLE_STATE_KEYS = new Set([
  'paused',
  'positions',
  'totalPnl',
  'deployedCapital',
  'totalCapital',
  'fearAndGreed',
])

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

  /** Read of an allowlisted BotState key (e.g. `fearAndGreed`). Returns `{ value }`. */
  @Get('state/:key')
  async getState(@Param('key') key: string): Promise<{ value: unknown }> {
    if (!READABLE_STATE_KEYS.has(key)) {
      throw new BadRequestException(`Unknown or non-readable state key: ${key}`)
    }
    return { value: await this.botState.get(key) }
  }
}

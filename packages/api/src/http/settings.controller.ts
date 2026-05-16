import { Body, Controller, Get, Put } from '@nestjs/common'
import { SettingsService } from '../settings/settings.service'
import type { BotSettings } from '../common'

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Current runtime settings — replaces web's getBotSettings action. */
  @Get()
  get(): Promise<BotSettings> {
    return this.settings.get()
  }

  /** Persists settings (clamped to bounds) — replaces web's saveBotSettings action. */
  @Put()
  save(@Body() body: BotSettings): Promise<BotSettings> {
    return this.settings.save(body)
  }
}

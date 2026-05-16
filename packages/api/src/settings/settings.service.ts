import { Injectable, Logger } from '@nestjs/common'
import { type BotSettings, normalizeBotSettings } from '../common'
import { BotStateRepository } from '../prisma/repositories/bot-state.repository'

/**
 * Single source of truth for runtime-editable bot settings. Both the HTTP
 * layer and the trading loop read settings through this service. Values are
 * normalised against their bounds on both read and write.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name)

  constructor(private readonly botState: BotStateRepository) {}

  /** Current settings, with defaults filling any missing/invalid field. */
  async get(): Promise<BotSettings> {
    return this.botState.getSettings()
  }

  /** Persists settings after clamping to bounds; returns the values saved. */
  async save(settings: BotSettings): Promise<BotSettings> {
    const before = await this.botState.getSettings()
    const normalized = normalizeBotSettings(settings)
    await this.botState.setSettings(normalized)

    const changed = (Object.keys(normalized) as (keyof BotSettings)[])
      .filter(k => normalized[k] !== before[k])
      .map(k => `${k}: ${String(before[k])} → ${String(normalized[k])}`)
    if (changed.length > 0) {
      this.logger.log(`Settings saved — ${changed.join(', ')}`)
    } else {
      this.logger.log('Settings saved — no changes')
    }
    return normalized
  }
}

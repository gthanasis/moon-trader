import { Injectable } from '@nestjs/common'
import { type BotSettings, normalizeBotSettings } from '../../common'
import { PrismaService } from '../prisma.service'

/** BotState key under which runtime-editable settings are stored. */
const SETTINGS_KEY = 'settings'

@Injectable()
export class BotStateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async get(key: string): Promise<unknown> {
    const row = await this.prisma.botState.findUnique({ where: { key } })
    return row ? row.value : null
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.prisma.botState.upsert({
      where: { key },
      create: { key, value: value as object },
      update: { value: value as object },
    })
  }

  /** Reads runtime settings, falling back to defaults for any missing/invalid field. */
  async getSettings(): Promise<BotSettings> {
    return normalizeBotSettings(await this.get(SETTINGS_KEY))
  }

  /** Persists runtime settings after normalizing them against the allowed bounds. */
  async setSettings(settings: BotSettings): Promise<void> {
    await this.set(SETTINGS_KEY, normalizeBotSettings(settings))
  }
}

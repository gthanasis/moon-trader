import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SettingsService } from '../../src/settings/settings.service'
import { DEFAULT_BOT_SETTINGS, type BotSettings } from '../../src/common'
import type { BotStateRepository } from '../../src/prisma/repositories/bot-state.repository'

/** A BotStateRepository test double backed by an in-memory `settings` value. */
function makeBotState(stored: unknown = null) {
  let value = stored
  return {
    getSettings: vi.fn(async () => {
      // Mirror the real repo: normalize on read.
      const { normalizeBotSettings } = await import('../../src/common')
      return normalizeBotSettings(value)
    }),
    setSettings: vi.fn(async (s: BotSettings) => {
      value = s
    }),
  } as unknown as BotStateRepository
}

describe('SettingsService', () => {
  let botState: ReturnType<typeof makeBotState>
  let service: SettingsService

  beforeEach(() => {
    botState = makeBotState()
    service = new SettingsService(botState)
  })

  it('get returns defaults when nothing is stored', async () => {
    expect(await service.get()).toEqual(DEFAULT_BOT_SETTINGS)
  })

  it('save clamps out-of-bounds values before persisting', async () => {
    const saved = await service.save({
      ...DEFAULT_BOT_SETTINGS,
      maxPositions: 9999,
      runIntervalMinutes: 0,
    })
    // 9999 and 0 are out of bounds, so they fall back to defaults.
    expect(saved.maxPositions).toBe(DEFAULT_BOT_SETTINGS.maxPositions)
    expect(saved.runIntervalMinutes).toBe(DEFAULT_BOT_SETTINGS.runIntervalMinutes)
  })

  it('save then get round-trips valid values', async () => {
    await service.save({ ...DEFAULT_BOT_SETTINGS, minConfidence: 0.8, maxPositions: 3 })
    const result = await service.get()
    expect(result.minConfidence).toBe(0.8)
    expect(result.maxPositions).toBe(3)
  })
})

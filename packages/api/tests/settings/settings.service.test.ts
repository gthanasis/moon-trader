import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SettingsService } from '../../src/settings/settings.service'
import {
  DEFAULT_BOT_SETTINGS,
  STRATEGY_PRESETS,
  normalizeBotSettings,
  type BotSettings,
} from '../../src/common'
import type { BotStateRepository } from '../../src/prisma/repositories/bot-state.repository'
import { EventsService } from '../../src/events/events.service'

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
  let events: EventsService
  let service: SettingsService

  beforeEach(() => {
    botState = makeBotState()
    events = new EventsService()
    service = new SettingsService(botState, events)
  })

  it('emits a settings_changed event on save', async () => {
    const spy = vi.spyOn(events, 'emit')
    await service.save({ ...DEFAULT_BOT_SETTINGS })
    expect(spy).toHaveBeenCalledWith('settings_changed')
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

  it('save persists a custom strategy prompt and template', async () => {
    await service.save({
      ...DEFAULT_BOT_SETTINGS,
      strategyPrompt: 'my strategy',
      promptTemplate: 'cash {capital}',
    })
    const result = await service.get()
    expect(result.strategyPrompt).toBe('my strategy')
    expect(result.promptTemplate).toBe('cash {capital}')
  })

  it('save falls back to default when a prompt string is empty', async () => {
    const saved = await service.save({ ...DEFAULT_BOT_SETTINGS, strategyPrompt: '   ' })
    expect(saved.strategyPrompt).toBe(DEFAULT_BOT_SETTINGS.strategyPrompt)
  })

  it('save falls back to default when a prompt string is too long', async () => {
    const saved = await service.save({ ...DEFAULT_BOT_SETTINGS, promptTemplate: 'x'.repeat(9000) })
    expect(saved.promptTemplate).toBe(DEFAULT_BOT_SETTINGS.promptTemplate)
  })

  it('every strategy preset has in-bounds settings that survive normalization', () => {
    for (const preset of STRATEGY_PRESETS) {
      const normalized = normalizeBotSettings({ ...preset.settings, paperMode: true })
      // No field was dropped back to a default — i.e. all values are valid.
      expect(normalized).toMatchObject(preset.settings)
    }
  })
})

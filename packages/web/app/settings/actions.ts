'use server'

import { botStateRepository } from '@trader/db'
import { type BotSettings, normalizeBotSettings } from '@trader/shared'

/** Reads the runtime-editable bot settings (defaults fill any missing field). */
export async function getBotSettings(): Promise<BotSettings> {
  return botStateRepository.getSettings()
}

/**
 * Persists bot settings after clamping every field to its allowed bounds.
 * The live runner re-reads these at the start of each cycle, so the change
 * takes effect without a restart. Returns the normalized values actually saved.
 */
export async function saveBotSettings(settings: BotSettings): Promise<BotSettings> {
  const normalized = normalizeBotSettings(settings)
  await botStateRepository.setSettings(normalized)
  return normalized
}

'use server'

import { botStateRepository } from '@trader/db'

/** Reads the shared `paused` flag that gates the live trading runner. */
export async function getBotPaused(): Promise<boolean> {
  return (await botStateRepository.get('paused')) === true
}

/**
 * Sets the shared `paused` flag. The live runner checks this at the start of
 * every evaluation cycle; the Telegram /pause /resume commands write the same key.
 */
export async function setBotPaused(paused: boolean): Promise<void> {
  await botStateRepository.set('paused', paused)
}

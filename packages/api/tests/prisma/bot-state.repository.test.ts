import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BotStateRepository } from '../../src/prisma/repositories/bot-state.repository'
import type { PrismaClient } from '@prisma/client'

function makeMockPrisma() {
  return {
    botState: { findUnique: vi.fn(), upsert: vi.fn() },
  } as unknown as PrismaClient
}

describe('BotStateRepository', () => {
  let prisma: PrismaClient
  let repo: BotStateRepository

  beforeEach(() => { prisma = makeMockPrisma(); repo = new BotStateRepository(prisma) })

  it('get returns null when key does not exist', async () => {
    (prisma.botState.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    expect(await repo.get('paused')).toBeNull()
  })

  it('get returns the stored value when key exists', async () => {
    (prisma.botState.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: '1', key: 'paused', value: true })
    expect(await repo.get('paused')).toBe(true)
  })

  it('set calls upsert with key and value', async () => {
    const mockUpsert = prisma.botState.upsert as ReturnType<typeof vi.fn>
    mockUpsert.mockResolvedValue({})
    await repo.set('paused', false)
    const args = mockUpsert.mock.calls[0][0] as Record<string, unknown>
    expect((args['where'] as Record<string, string>)['key']).toBe('paused')
    expect((args['create'] as Record<string, unknown>)['value']).toBe(false)
    expect((args['update'] as Record<string, unknown>)['value']).toBe(false)
  })

  it('set can store object values', async () => {
    const mockUpsert = prisma.botState.upsert as ReturnType<typeof vi.fn>
    mockUpsert.mockResolvedValue({})
    await repo.set('config', { coins: ['BTC/USDT'] })
    const args = mockUpsert.mock.calls[0][0] as Record<string, unknown>
    expect((args['create'] as Record<string, unknown>)['value']).toEqual({ coins: ['BTC/USDT'] })
  })
})

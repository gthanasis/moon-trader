import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LessonRepository } from '../../src/prisma/repositories/lesson.repository'
import type { PrismaService } from '../../src/prisma/prisma.service'

function makeMockPrisma() {
  return {
    lesson: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  } as unknown as PrismaService
}

function lessonRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'l1', text: 'a lesson', category: 'entry',
    evidenceFor: 0, evidenceAgainst: 0, status: 'active',
    createdAt: new Date(), updatedAt: new Date(), ...over,
  }
}

describe('LessonRepository', () => {
  let prisma: PrismaService
  let repo: LessonRepository

  beforeEach(() => {
    prisma = makeMockPrisma()
    repo = new LessonRepository(prisma)
  })

  it('proposes a lesson via upsert, leaving an existing one untouched', async () => {
    await repo.propose({ text: 'do not buy RSI>70 in chop', category: 'entry' })
    const upsert = prisma.lesson.upsert as ReturnType<typeof vi.fn>
    const arg = upsert.mock.calls[0][0]
    expect(arg.where).toEqual({ text: 'do not buy RSI>70 in chop' })
    expect(arg.create).toMatchObject({ text: 'do not buy RSI>70 in chop', category: 'entry' })
    expect(arg.update).toEqual({}) // no overwrite of evidence
  })

  it('increments supporting evidence', async () => {
    ;(prisma.lesson.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(lessonRow({ evidenceFor: 2 }))
    await repo.addEvidence('a lesson', 'for')
    const update = prisma.lesson.update as ReturnType<typeof vi.fn>
    expect(update.mock.calls[0][0].data).toMatchObject({ evidenceFor: 3, evidenceAgainst: 0, status: 'active' })
  })

  it('increments contradicting evidence', async () => {
    ;(prisma.lesson.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(lessonRow({ evidenceAgainst: 1 }))
    await repo.addEvidence('a lesson', 'against')
    const update = prisma.lesson.update as ReturnType<typeof vi.fn>
    expect(update.mock.calls[0][0].data).toMatchObject({ evidenceAgainst: 2, status: 'active' })
  })

  it('retires a lesson once contradicting evidence dominates', async () => {
    // for 0, against 2 → +against → 3 against, 0 for → retired
    ;(prisma.lesson.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(lessonRow({ evidenceFor: 0, evidenceAgainst: 2 }))
    await repo.addEvidence('a lesson', 'against')
    const update = prisma.lesson.update as ReturnType<typeof vi.fn>
    expect(update.mock.calls[0][0].data.status).toBe('retired')
  })

  it('keeps a well-supported lesson active despite some contradicting evidence', async () => {
    // for 5, against 2 → +against → 3 against, 5 for → 3 > 10 is false → stays active
    ;(prisma.lesson.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(lessonRow({ evidenceFor: 5, evidenceAgainst: 2 }))
    await repo.addEvidence('a lesson', 'against')
    const update = prisma.lesson.update as ReturnType<typeof vi.fn>
    expect(update.mock.calls[0][0].data.status).toBe('active')
  })

  it('is a no-op when adding evidence to an unknown lesson', async () => {
    ;(prisma.lesson.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    await repo.addEvidence('missing', 'for')
    expect(prisma.lesson.update).not.toHaveBeenCalled()
  })

  it('returns active lessons ordered by net evidence', async () => {
    ;(prisma.lesson.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      lessonRow({ text: 'weak', evidenceFor: 1, evidenceAgainst: 1 }),   // net 0
      lessonRow({ text: 'strong', evidenceFor: 6, evidenceAgainst: 1 }), // net 5
      lessonRow({ text: 'mid', evidenceFor: 3, evidenceAgainst: 1 }),    // net 2
    ])
    const lessons = await repo.activeLessons()
    expect(lessons.map(l => l.text)).toEqual(['strong', 'mid', 'weak'])
  })

  it('caps the number of active lessons returned', async () => {
    ;(prisma.lesson.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => lessonRow({ text: `l${i}`, evidenceFor: i })),
    )
    const lessons = await repo.activeLessons(5)
    expect(lessons).toHaveLength(5)
  })
})

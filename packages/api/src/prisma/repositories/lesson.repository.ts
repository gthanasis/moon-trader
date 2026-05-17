import { Injectable } from '@nestjs/common'
import type { Lesson, LessonCategory, LessonProposal, LessonStatus } from '../../common'
import { PrismaService } from '../prisma.service'

type LessonRow = {
  id: string
  text: string
  category: string
  evidenceFor: number
  evidenceAgainst: number
  status: string
  createdAt: Date
  updatedAt: Date
}

function toDomain(row: LessonRow): Lesson {
  return {
    id: row.id,
    text: row.text,
    category: row.category as LessonCategory,
    evidenceFor: row.evidenceFor,
    evidenceAgainst: row.evidenceAgainst,
    status: row.status as LessonStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

@Injectable()
export class LessonRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inserts a new lesson keyed on its text. A re-proposal of an existing
   * lesson is left untouched — it carries no new evidence on its own.
   */
  async propose(proposal: LessonProposal): Promise<void> {
    await this.prisma.lesson.upsert({
      where: { text: proposal.text },
      create: { text: proposal.text, category: proposal.category },
      update: {},
    })
  }

  /**
   * Records one unit of evidence for or against a lesson, and retires it once
   * contradicting evidence clearly dominates (≥3 against and more than double
   * the supporting evidence). No-op for an unknown lesson.
   */
  async addEvidence(text: string, kind: 'for' | 'against'): Promise<void> {
    const lesson = await this.prisma.lesson.findUnique({ where: { text } })
    if (!lesson) return
    const evidenceFor = lesson.evidenceFor + (kind === 'for' ? 1 : 0)
    const evidenceAgainst = lesson.evidenceAgainst + (kind === 'against' ? 1 : 0)
    const retired = evidenceAgainst >= 3 && evidenceAgainst > evidenceFor * 2
    await this.prisma.lesson.update({
      where: { text },
      data: { evidenceFor, evidenceAgainst, status: retired ? 'retired' : lesson.status },
    })
  }

  /** Active lessons, strongest net evidence (`for − against`) first. */
  async activeLessons(limit = 12): Promise<Lesson[]> {
    const rows = (await this.prisma.lesson.findMany({ where: { status: 'active' } })) as LessonRow[]
    return rows
      .map(toDomain)
      .sort((a, b) => b.evidenceFor - b.evidenceAgainst - (a.evidenceFor - a.evidenceAgainst))
      .slice(0, limit)
  }
}

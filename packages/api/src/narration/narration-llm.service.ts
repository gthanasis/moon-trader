import { Injectable, Logger } from '@nestjs/common'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { LessonCategory, LessonProposal } from '../common'
import type { NarrationPrompt } from './narration-prompt'

/** The critic's verdict on an existing lesson, for one reviewed period. */
export interface LessonOutcome {
  text: string
  verdict: 'validated' | 'contradicted'
}

/** The structured result of a post-mortem critic LLM call. */
export interface NarrationText {
  summary: string
  assessment: string | null
  /** New falsifiable lessons proposed by the critic. */
  lessons: LessonProposal[]
  /** Verdicts on the lessons already guiding the bot. */
  lessonOutcomes: LessonOutcome[]
}

const VALID_CATEGORIES = new Set<LessonCategory>(['entry', 'exit', 'sizing', 'regime', 'risk', 'general'])

/** Extracts well-formed lesson proposals from an untrusted JSON value. */
function parseLessons(raw: unknown): LessonProposal[] {
  if (!Array.isArray(raw)) return []
  const out: LessonProposal[] = []
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const { text, category } = item as { text?: unknown; category?: unknown }
      if (typeof text === 'string' && text.trim() && VALID_CATEGORIES.has(category as LessonCategory)) {
        out.push({ text: text.trim(), category: category as LessonCategory })
      }
    }
  }
  return out
}

/** Extracts well-formed lesson verdicts from an untrusted JSON value. */
function parseOutcomes(raw: unknown): LessonOutcome[] {
  if (!Array.isArray(raw)) return []
  const out: LessonOutcome[] = []
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const { text, verdict } = item as { text?: unknown; verdict?: unknown }
      if (typeof text === 'string' && text.trim() && (verdict === 'validated' || verdict === 'contradicted')) {
        out.push({ text: text.trim(), verdict })
      }
    }
  }
  return out
}

/**
 * Generates the post-mortem critique via the LLM. Separate from the trading
 * `LLMAdapter` (which only emits structured decisions). Provider and key come
 * from LLM_PROVIDER / *_API_KEY env vars.
 */
@Injectable()
export class NarrationLlmService {
  private readonly logger = new Logger(NarrationLlmService.name)

  async narrate(prompt: NarrationPrompt): Promise<NarrationText> {
    const provider = process.env['LLM_PROVIDER'] ?? 'openai'
    const raw =
      provider === 'openai'
        ? await this.callOpenAI(prompt)
        : await this.callAnthropic(prompt)
    return this.parse(raw)
  }

  private async callOpenAI(prompt: NarrationPrompt): Promise<string> {
    const apiKey = process.env['OPENAI_API_KEY']
    if (!apiKey) throw new Error('OPENAI_API_KEY is required for narration')
    const client = new OpenAI({ apiKey })
    const res = await client.chat.completions.create({
      model: process.env['NARRATION_MODEL'] ?? 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
    })
    return res.choices[0]?.message?.content ?? ''
  }

  private async callAnthropic(prompt: NarrationPrompt): Promise<string> {
    const apiKey = process.env['ANTHROPIC_API_KEY']
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required for narration')
    const client = new Anthropic({ apiKey })
    const res = await client.messages.create({
      model: process.env['NARRATION_MODEL'] ?? 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
    })
    const block = res.content.find(b => b.type === 'text')
    return block && block.type === 'text' ? block.text : ''
  }

  /** Parses the model's JSON reply, tolerating code fences and stray prose. */
  private parse(raw: string): NarrationText {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        const obj = JSON.parse(match[0]) as Record<string, unknown>
        return {
          summary: typeof obj['summary'] === 'string' ? obj['summary'] : raw.trim(),
          assessment: typeof obj['assessment'] === 'string' ? obj['assessment'] : null,
          lessons: parseLessons(obj['lessons']),
          lessonOutcomes: parseOutcomes(obj['lessonOutcomes']),
        }
      } catch {
        this.logger.warn('Narration LLM reply was not valid JSON — using raw text')
      }
    }
    return { summary: raw.trim(), assessment: null, lessons: [], lessonOutcomes: [] }
  }
}

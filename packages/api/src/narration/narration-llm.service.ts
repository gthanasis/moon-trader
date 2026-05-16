import { Injectable, Logger } from '@nestjs/common'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { NarrationPrompt } from './narration-prompt'

/** The free-text result of a narration LLM call. */
export interface NarrationText {
  summary: string
  assessment: string | null
}

/**
 * Generates plain-language narration text via the LLM. Separate from the
 * trading `LLMAdapter` (which only emits structured decisions). Provider and
 * key come from LLM_PROVIDER / *_API_KEY env vars.
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
      max_tokens: 512,
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
        const obj = JSON.parse(match[0]) as { summary?: unknown; assessment?: unknown }
        return {
          summary: typeof obj.summary === 'string' ? obj.summary : raw.trim(),
          assessment: typeof obj.assessment === 'string' ? obj.assessment : null,
        }
      } catch {
        this.logger.warn('Narration LLM reply was not valid JSON — using raw text')
      }
    }
    return { summary: raw.trim(), assessment: null }
  }
}

import Anthropic from '@anthropic-ai/sdk'
import type { TradingContext, LLMDecision } from '../../common'
import type { LLMAdapter } from './base'
import { buildPrompt } from '../prompt-builder'

const TOOL_DEFINITION: Anthropic.Tool = {
  name: 'make_trading_decision',
  description: 'Submit a trading decision based on the market analysis',
  input_schema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['buy', 'sell', 'hold'] },
      coin: { type: 'string', description: 'Coin pair e.g. BTC/USDT' },
      size: { type: 'number', description: 'Trade size in USDT' },
      confidence: { type: 'number', description: 'Confidence score 0-1' },
      reasoning: { type: 'string', description: 'Reasoning for the decision' },
      stopLoss: { type: 'number', description: 'Stop loss price (optional)' },
      takeProfit: { type: 'number', description: 'Take profit price (optional)' },
    },
    required: ['action', 'coin', 'size', 'confidence', 'reasoning'],
  },
}

interface ClaudeAdapterConfig {
  apiKey: string
  model?: string
}

export class ClaudeAdapter implements LLMAdapter {
  private readonly client: Anthropic
  private readonly model: string

  constructor(config: ClaudeAdapterConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey })
    this.model = config.model ?? 'claude-sonnet-4-6'
  }

  async decide(context: TradingContext): Promise<LLMDecision> {
    const { system, user } = buildPrompt(context)

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      // cache_control is supported at runtime but not in this SDK's TextBlockParam type
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] as any,
      messages: [{ role: 'user', content: user }],
      tools: [TOOL_DEFINITION],
      tool_choice: { type: 'any' },
    })

    const toolUse = response.content.find(b => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      return { action: 'hold', coin: '', size: 0, confidence: 0, reasoning: 'No tool use in response' }
    }

    return toolUse.input as LLMDecision
  }
}

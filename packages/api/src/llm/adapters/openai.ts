import OpenAI from 'openai'
import type { TradingContext, LLMDecision } from '../../common'
import type { LLMAdapter } from './base'
import { buildPrompt } from '../prompt-builder'

const TOOL_DEFINITION: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'make_trading_decision',
    description: 'Submit a trading decision based on the market analysis',
    parameters: {
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
  },
}

interface OpenAIAdapterConfig {
  apiKey: string
  model?: string
}

export class OpenAIAdapter implements LLMAdapter {
  private readonly client: OpenAI
  private readonly model: string

  constructor(config: OpenAIAdapterConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey })
    this.model = config.model ?? 'gpt-4o'
  }

  async decide(context: TradingContext): Promise<LLMDecision> {
    const { system, user } = buildPrompt(context)

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      tools: [TOOL_DEFINITION],
      tool_choice: { type: 'function', function: { name: 'make_trading_decision' } },
    })

    const toolCall = response.choices[0]?.message?.tool_calls?.[0]
    if (!toolCall) {
      return { action: 'hold', coin: '', size: 0, confidence: 0, reasoning: 'No tool call in response' }
    }

    return JSON.parse(toolCall.function.arguments) as LLMDecision
  }
}

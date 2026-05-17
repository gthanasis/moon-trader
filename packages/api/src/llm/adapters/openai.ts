import OpenAI from 'openai'
import type { TradingContext, LLMDecision } from '../../common'
import type { LLMAdapter } from './base'
import { buildPrompt } from '../prompt-builder'

const TOOL_DEFINITION: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'make_trading_decision',
    description: 'Submit a trading decision for one coin. Call this tool once per coin you have a view on.',
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

  async decide(context: TradingContext): Promise<LLMDecision[]> {
    const { system, user } = buildPrompt(context)

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      tools: [TOOL_DEFINITION],
      // 'required' forces at least one tool call but lets the model emit one
      // per coin, instead of pinning it to a single call.
      tool_choice: 'required',
    })

    // The model may return several tool calls in one turn — one per coin.
    const toolCalls = response.choices[0]?.message?.tool_calls ?? []
    const decisions = toolCalls
      .filter(c => c.type === 'function' && c.function.name === 'make_trading_decision')
      .map(c => JSON.parse(c.function.arguments) as LLMDecision)

    if (decisions.length === 0) {
      return [{ action: 'hold', coin: '', size: 0, confidence: 0, reasoning: 'No tool call in response' }]
    }

    return decisions
  }
}

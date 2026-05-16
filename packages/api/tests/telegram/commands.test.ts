import { describe, it, expect, vi, beforeEach } from 'vitest'
import { registerCommands } from '../../src/telegram/commands'
import type { BotStateRepository } from '../../src/prisma/repositories/bot-state.repository'

/** In-memory BotStateRepository double — registerCommands now takes the repo. */
function makeBotState() {
  return {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
  } as unknown as BotStateRepository
}

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    reply: vi.fn().mockResolvedValue({}),
    ...overrides,
  }
}

function makeBot() {
  const handlers = new Map<string, (ctx: unknown) => Promise<void>>()
  return {
    command: vi.fn((cmd: string, handler: (ctx: unknown) => Promise<void>) => {
      handlers.set(cmd, handler)
    }),
    _trigger: async (cmd: string, ctx: unknown) => {
      const handler = handlers.get(cmd)
      if (!handler) throw new Error(`No handler for /${cmd}`)
      await handler(ctx)
    },
  }
}

type BotArg = Parameters<typeof registerCommands>[0]

describe('registerCommands', () => {
  let botState: BotStateRepository

  beforeEach(() => {
    vi.clearAllMocks()
    botState = makeBotState()
  })

  it('/pause sets paused=true in botState and replies', async () => {
    const bot = makeBot()
    registerCommands(bot as unknown as BotArg, botState)
    const ctx = makeCtx()

    await bot._trigger('pause', ctx)

    expect(botState.set).toHaveBeenCalledWith('paused', true)
    expect(ctx.reply).toHaveBeenCalledOnce()
    const [msg] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(msg.toLowerCase()).toContain('pause')
  })

  it('/resume sets paused=false in botState and replies', async () => {
    const bot = makeBot()
    registerCommands(bot as unknown as BotArg, botState)
    const ctx = makeCtx()

    await bot._trigger('resume', ctx)

    expect(botState.set).toHaveBeenCalledWith('paused', false)
    expect(ctx.reply).toHaveBeenCalledOnce()
    const [msg] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(msg.toLowerCase()).toContain('resum')
  })

  it('/status reads positions and pnl from botState and replies', async () => {
    const bot = makeBot()
    registerCommands(bot as unknown as BotArg, botState)
    const ctx = makeCtx()
    ;(botState.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
      if (key === 'positions') return [{ coin: 'BTC/USDT' }, { coin: 'ETH/USDT' }]
      if (key === 'totalPnl') return 42.5
      return null
    })

    await bot._trigger('status', ctx)

    expect(ctx.reply).toHaveBeenCalledOnce()
    const [msg] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(msg).toContain('2') // 2 open positions
    expect(msg).toContain('42.5')
  })

  it('/status handles null DB values gracefully', async () => {
    const bot = makeBot()
    registerCommands(bot as unknown as BotArg, botState)
    const ctx = makeCtx()
    ;(botState.get as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    await bot._trigger('status', ctx)

    expect(ctx.reply).toHaveBeenCalledOnce()
    const [msg] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(msg).toContain('0') // 0 positions, $0 P&L
  })

  it('/capital reads deployedCapital and totalCapital from botState and replies', async () => {
    const bot = makeBot()
    registerCommands(bot as unknown as BotArg, botState)
    const ctx = makeCtx()
    ;(botState.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
      if (key === 'deployedCapital') return 750
      if (key === 'totalCapital') return 1000
      return null
    })

    await bot._trigger('capital', ctx)

    expect(ctx.reply).toHaveBeenCalledOnce()
    const [msg] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(msg).toContain('750')
    expect(msg).toContain('1000')
  })
})

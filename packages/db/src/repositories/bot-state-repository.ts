import type { PrismaClient } from '@prisma/client'

export class BotStateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(key: string): Promise<unknown> {
    const row = await this.prisma.botState.findUnique({ where: { key } })
    return row ? row.value : null
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.prisma.botState.upsert({
      where: { key },
      create: { key, value: value as object },
      update: { value: value as object },
    })
  }
}

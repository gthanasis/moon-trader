import { NextResponse } from 'next/server'
import { tradeRepository } from '@trader/db'

export async function GET(): Promise<NextResponse> {
  try {
    const positions = await tradeRepository.findOpenTrades()
    return NextResponse.json(positions, { status: 200 })
  } catch (_err) {
    return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 })
  }
}

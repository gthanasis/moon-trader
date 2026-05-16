import { backtestRunRepository } from '@trader/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const runs = await backtestRunRepository.findAll(50)
    return NextResponse.json(runs)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

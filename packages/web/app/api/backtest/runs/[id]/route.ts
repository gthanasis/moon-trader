import { backtestRunRepository } from '@trader/db'
import { NextResponse } from 'next/server'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const run = await backtestRunRepository.findById(params.id)
    if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(run)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { decisionRepository } from '@trader/db'

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = await req.json() as { status?: string }
  if (body.status !== 'approved' && body.status !== 'rejected') {
    return NextResponse.json({ error: 'status must be approved or rejected' }, { status: 400 })
  }
  await decisionRepository.updateDecisionStatus(params.id, body.status)
  return NextResponse.json({ ok: true })
}

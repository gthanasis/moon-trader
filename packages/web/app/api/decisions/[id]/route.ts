import { NextResponse } from 'next/server'
import { decisionRepository } from '@trader/db'

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  let body: { status?: string }
  try {
    body = await req.json() as { status?: string }
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  if (body.status !== 'approved' && body.status !== 'rejected') {
    return NextResponse.json({ error: 'status must be approved or rejected' }, { status: 400 })
  }
  await decisionRepository.updateDecisionStatus(params.id, body.status)
  return NextResponse.json({ ok: true })
}

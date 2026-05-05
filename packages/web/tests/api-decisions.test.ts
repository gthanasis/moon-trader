import { describe, it, expect, vi } from 'vitest'

vi.mock('@trader/db', () => ({
  decisionRepository: {
    updateDecisionStatus: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('PATCH /api/decisions/[id]', () => {
  it('rejects invalid status', async () => {
    const { PATCH } = await import('../app/api/decisions/[id]/route')
    const req = new Request('http://localhost/api/decisions/abc', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'invalid' }),
    })
    const res = await PATCH(req, { params: { id: 'abc' } })
    expect(res.status).toBe(400)
  })

  it('accepts approved status', async () => {
    const { PATCH } = await import('../app/api/decisions/[id]/route')
    const req = new Request('http://localhost/api/decisions/abc', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    })
    const res = await PATCH(req, { params: { id: 'abc' } })
    expect(res.status).toBe(200)
  })
})

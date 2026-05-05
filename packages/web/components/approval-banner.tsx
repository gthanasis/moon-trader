'use client'

import { useState, useEffect, useCallback } from 'react'
import type { StoredDecision } from '@trader/db'

interface ApprovalBannerProps {
  decision: StoredDecision
  onDismiss: () => void
}

function useCountdown(expiresAt: Date | null): string {
  const [remaining, setRemaining] = useState('')
  useEffect(() => {
    if (!expiresAt) return
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now()
      if (diff <= 0) { setRemaining('Expired'); return }
      const m = Math.floor(diff / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setRemaining(`${m}:${s.toString().padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])
  return remaining
}

export function ApprovalBanner({ decision, onDismiss }: ApprovalBannerProps) {
  const countdown = useCountdown(decision.expiresAt)
  const [loading, setLoading] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const respond = useCallback(async (status: 'approved' | 'rejected') => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/decisions/${decision.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      onDismiss()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
      setLoading(false)
    }
  }, [decision.id, onDismiss])

  const actionLabel = decision.action.toUpperCase()
  const sideColor = decision.action === 'buy' ? 'var(--pos)' : 'var(--neg)'

  return (
    <div style={{
      background: 'color-mix(in oklch, var(--warn) 8%, var(--surface))',
      border: '1px solid color-mix(in oklch, var(--warn) 40%, var(--border))',
      borderRadius: 'var(--r)',
      padding: '14px 16px',
      marginBottom: '16px',
      display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: '9.5px', color: 'var(--warn)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
            <span className="xp">Approval Needed</span>
            <span className="nb">Your decision needed</span>
          </div>
          <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--fg)' }}>
            <span className="xp">
              <span style={{ color: sideColor }}>{actionLabel}</span>
              {' '}${decision.size} {decision.coin} — confidence {decision.confidence.toFixed(2)}
            </span>
            <span className="nb">
              <span style={{ color: sideColor }}>{decision.action === 'buy' ? 'Buy' : 'Sell'}</span>
              {' '}${decision.size} of {decision.coin} — AI is {Math.round(decision.confidence * 100)}% confident
            </span>
          </div>
        </div>
        {countdown && (
          <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--muted)' }}>
            {countdown}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        {decision.stopLoss != null && (
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: '9.5px', color: 'var(--muted)', textTransform: 'uppercase' }}>
              <span className="xp">Stop Loss</span>
              <span className="nb">Exit if drops to</span>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--neg)' }}>${decision.stopLoss.toFixed(2)}</div>
          </div>
        )}
        {decision.takeProfit != null && (
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: '9.5px', color: 'var(--muted)', textTransform: 'uppercase' }}>
              <span className="xp">Take Profit</span>
              <span className="nb">Max profit target</span>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--pos)' }}>${decision.takeProfit.toFixed(2)}</div>
          </div>
        )}
      </div>

      <div style={{ fontSize: '11.5px', color: 'var(--muted)', lineHeight: 1.5 }}>
        {decision.reasoning}
      </div>

      {error && <div style={{ fontSize: '10px', color: 'var(--neg)' }}>{error}</div>}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => void respond('approved')}
          disabled={loading}
          style={{
            padding: '5px 14px', borderRadius: 'var(--r)',
            background: 'var(--accent)', color: '#000',
            border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
          }}
        >
          Approve
        </button>
        <button
          onClick={() => void respond('rejected')}
          disabled={loading}
          style={{
            padding: '5px 14px', borderRadius: 'var(--r)',
            background: 'transparent', color: 'var(--neg)',
            border: '1px solid var(--neg)', cursor: 'pointer', fontSize: '11px',
          }}
        >
          Reject
        </button>
      </div>
    </div>
  )
}

import type { StoredDecision } from '@trader/db'

interface DecisionLogProps {
  decisions: StoredDecision[]
}

const ACTION_COLOR: Record<string, string> = {
  buy:  'var(--pos)',
  sell: 'var(--neg)',
  hold: 'var(--muted)',
}

export function DecisionLog({ decisions }: DecisionLogProps) {
  if (decisions.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: '11px' }}>No decisions yet.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {decisions.map(d => {
        const color = ACTION_COLOR[d.action] ?? 'var(--muted)'
        const time = new Date(d.decidedAt).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
        const isBlocked = d.status === 'blocked' && d.action !== 'hold'
        const isFilled = d.status === 'executed' && d.action !== 'hold'
        return (
          <div key={d.id} style={{
            background: isBlocked ? 'color-mix(in srgb, var(--neg) 5%, var(--surface))' : 'var(--surface)',
            border: `1px solid ${isBlocked ? 'color-mix(in srgb, var(--neg) 30%, var(--border))' : 'var(--border)'}`,
            borderRadius: 'var(--r)',
            padding: '10px 12px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, color }}>
                  {d.action.toUpperCase()}
                </span>
                {d.coin && (
                  <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--fg)' }}>
                    {d.coin}
                  </span>
                )}
                {isFilled && (
                  <span style={{
                    fontFamily: 'monospace', fontSize: '9px', fontWeight: 600, letterSpacing: '0.04em',
                    padding: '1px 5px', borderRadius: '3px',
                    background: 'color-mix(in srgb, var(--pos) 18%, transparent)', color: 'var(--pos)',
                  }}>FILLED</span>
                )}
                {isBlocked && (
                  <span style={{
                    fontFamily: 'monospace', fontSize: '9px', fontWeight: 600, letterSpacing: '0.04em',
                    padding: '1px 5px', borderRadius: '3px',
                    background: 'color-mix(in srgb, var(--neg) 18%, transparent)', color: 'var(--neg)',
                  }}>BLOCKED</span>
                )}
                <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--muted)' }}>
                  {(d.confidence * 100).toFixed(0)}% confident
                </span>
              </div>
              <span style={{ fontFamily: 'monospace', fontSize: '9.5px', color: 'var(--muted)' }}>{time}</span>
            </div>
            {isBlocked && d.blockedReason && (
              <p style={{ fontSize: '10.5px', color: 'var(--neg)', margin: '0 0 5px', fontFamily: 'monospace' }}>
                blocked: {d.blockedReason}
              </p>
            )}
            <p style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>
              {d.reasoning}
            </p>
          </div>
        )
      })}
    </div>
  )
}

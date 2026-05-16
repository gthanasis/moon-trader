import type { Signal, SignalType } from '@api/common'

const DOT_COLOR: Record<SignalType, string> = {
  news:      'var(--neg)',
  sentiment: 'var(--warn)',
  onchain:   'var(--pos)',
  macro:     'var(--info)',
  price:     'var(--muted)',
}

interface SignalFeedProps {
  signals: Signal[]
}

export function SignalFeed({ signals }: SignalFeedProps) {
  if (signals.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: '11px' }}>No recent signals.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {signals.map((s, i) => {
        const coins = s.coins?.join(', ')
        return (
          <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: DOT_COLOR[s.type],
              marginTop: '4px', flexShrink: 0,
            }} />
            <div>
              <div style={{ fontSize: '9.5px', fontFamily: 'monospace', color: 'var(--muted)', marginBottom: '2px' }}>
                <span className="xp">
                  {s.source?.toUpperCase() ?? ''} · {s.type ?? ''}{coins ? ` · [${coins}]` : ''}
                </span>
                <span className="nb">
                  {s.type.charAt(0).toUpperCase() + s.type.slice(1)}{coins ? ` · ${coins.toUpperCase()}` : ''}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--fg)', lineHeight: 1.5 }}>
                {s.content}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

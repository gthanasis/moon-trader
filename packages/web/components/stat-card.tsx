'use client'

interface StatCardProps {
  label: string
  labelSimple?: string
  value: string
  sub?: string
  subSimple?: string
  colorVariant?: 'pos' | 'neg' | 'warn' | 'info' | 'neutral'
}

const variantColor: Record<NonNullable<StatCardProps['colorVariant']>, string> = {
  pos:     'var(--pos)',
  neg:     'var(--neg)',
  warn:    'var(--warn)',
  info:    'var(--info)',
  neutral: 'var(--fg)',
}

export function StatCard({ label, labelSimple, value, sub, subSimple, colorVariant = 'neutral' }: StatCardProps) {
  const valueColor = variantColor[colorVariant]
  const subColor = colorVariant === 'neutral' ? 'var(--muted)' : valueColor

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r)',
      padding: '14px 16px',
      cursor: 'default',
      transition: 'border-color 0.15s',
    }}
    onMouseEnter={e => (e.currentTarget.style.borderColor = 'color-mix(in oklch, var(--accent) 40%, var(--border))')}
    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      <div style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
        {labelSimple ? (
          <>
            <span className="xp">{label}</span>
            <span className="nb">{labelSimple}</span>
          </>
        ) : label}
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: '20px', fontWeight: 600, color: valueColor, fontVariantNumeric: 'tabular-nums', marginBottom: sub || subSimple ? '4px' : 0 }}>
        {value}
      </div>
      {(sub || subSimple) && (
        <div style={{ fontFamily: 'monospace', fontSize: '10px', color: subColor }}>
          {sub && <span className="xp">{sub}</span>}
          {subSimple && <span className="nb">{subSimple}</span>}
        </div>
      )}
    </div>
  )
}

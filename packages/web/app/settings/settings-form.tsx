'use client'

import { useMemo, useState, useTransition } from 'react'
import { type BotSettings, BOT_SETTINGS_BOUNDS, DEFAULT_BOT_SETTINGS } from '@trader/shared'
import { saveBotSettings } from './actions'

/**
 * Per-field display metadata. `scale` converts the stored value to what the
 * user sees: fraction fields (0.01) are shown as percentages (1).
 */
interface FieldDef {
  key: keyof BotSettings
  label: string
  unit: string
  scale: number
  step: number
  /** Single cause-and-effect line: what happens when you change this value. */
  explain: string
  /** When set, the field renders as a dropdown of these (stored-value) choices. */
  options?: { value: number; label: string }[]
}

const INTERVAL_OPTIONS = [
  { value: 5, label: 'Every 5 minutes' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
  { value: 120, label: 'Every 2 hours' },
  { value: 240, label: 'Every 4 hours' },
  { value: 360, label: 'Every 6 hours' },
  { value: 720, label: 'Every 12 hours' },
  { value: 1440, label: 'Once a day' },
]

// Ordered to match GROUPS below; the flat index drives the 01–06 numbering.
const FIELDS: FieldDef[] = [
  {
    key: 'runIntervalMinutes',
    label: 'Run interval',
    unit: 'min',
    scale: 1,
    step: 1,
    explain: 'A longer interval evaluates less often — cheaper and calmer. A shorter one reacts faster but spends more on LLM calls.',
    options: INTERVAL_OPTIONS,
  },
  {
    key: 'minConfidence',
    label: 'Minimum confidence',
    unit: '%',
    scale: 100,
    step: 1,
    explain: 'Raise it and only high-conviction signals trade. Lower it and the bot trades more often, including on weaker signals.',
  },
  {
    key: 'autoTradeLimit',
    label: 'Auto-trade limit',
    unit: 'USD',
    scale: 1,
    step: 10,
    explain: 'Trades up to this size execute on their own. Raise it to auto-trade larger; set 0 to approve every trade by hand.',
  },
  {
    key: 'riskPerTradePct',
    label: 'Risk per trade',
    unit: '%',
    scale: 100,
    step: 0.1,
    explain: 'Raise it for larger positions and bigger account swings. Lower it to risk less of your capital on each trade.',
  },
  {
    key: 'maxPositions',
    label: 'Max open positions',
    unit: 'max',
    scale: 1,
    step: 1,
    explain: 'Raise it to let the bot hold more positions at once. Lower it to cap total exposure and concentration.',
  },
  {
    key: 'dailyLossLimitPct',
    label: 'Daily loss limit',
    unit: '%',
    scale: 100,
    step: 0.5,
    explain: 'Once the day loses this much, new buys stop until the next UTC day. Raise it to tolerate deeper drawdowns.',
  },
]

/** Logical sections shown on the page, in render order. */
const GROUPS: { name: string; hint: string; keys: (keyof BotSettings)[] }[] = [
  { name: 'Schedule', hint: 'How often the bot evaluates the market', keys: ['runIntervalMinutes'] },
  {
    name: 'Decision & approval',
    hint: 'What the bot acts on, and when you stay in the loop',
    keys: ['minConfidence', 'autoTradeLimit'],
  },
  {
    name: 'Risk controls',
    hint: 'Limits that protect your capital',
    keys: ['riskPerTradePct', 'maxPositions', 'dailyLossLimitPct'],
  },
]

const FIELD_BY_KEY = Object.fromEntries(FIELDS.map(f => [f.key, f])) as Record<keyof BotSettings, FieldDef>

const fmt = (n: number) => {
  const r = Math.round(n * 1e4) / 1e4
  return Number.isInteger(r) ? String(r) : String(r)
}
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export function SettingsForm({ initial }: { initial: BotSettings }) {
  const [saved, setSaved] = useState<BotSettings>(initial)
  const [values, setValues] = useState<BotSettings>(initial)
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const dirty = useMemo(
    () => FIELDS.some(f => values[f.key] !== saved[f.key]),
    [values, saved],
  )

  const setField = (f: FieldDef, displayVal: number) => {
    if (!Number.isFinite(displayVal)) return
    const b = BOT_SETTINGS_BOUNDS[f.key]
    const stored = clamp(displayVal / f.scale, b.min, b.max)
    setValues(v => ({ ...v, [f.key]: Math.round(stored * 1e6) / 1e6 }))
    setStatus(null)
  }

  const save = () => {
    setStatus(null)
    startTransition(async () => {
      try {
        const result = await saveBotSettings(values)
        setSaved(result)
        setValues(result)
        setStatus({ kind: 'ok', text: 'Saved. The bot applies this on its next cycle.' })
      } catch {
        setStatus({ kind: 'error', text: 'Save failed. Check the connection and retry.' })
      }
    })
  }

  return (
    <div className="panel">
      <header className="phead">
        <div className="eyebrow">/ / &nbsp;control&nbsp;panel</div>
        <h1 className="ptitle">Bot Settings</h1>
        <p className="psub">
          Live trading parameters. Saved values are re-read at the start of every evaluation
          cycle &mdash; no restart needed. API keys, traded coins and the candle timeframe live in{' '}
          <code>.env</code> and are not editable here.
        </p>
      </header>

      <div className="modules">
        {GROUPS.map(group => (
          <div className="group" key={group.name}>
            <div className="grouphead">
              <span className="gname">{group.name}</span>
              <span className="ghint">{group.hint}</span>
            </div>
            {group.keys.map(key => {
              const f = FIELD_BY_KEY[key]
              const i = FIELDS.indexOf(f)
              const b = BOT_SETTINGS_BOUNDS[f.key]
              const display = values[f.key] * f.scale
              const changed = values[f.key] !== saved[f.key]
              const atDefault = values[f.key] === DEFAULT_BOT_SETTINGS[f.key]
              return (
                <section
                  key={f.key}
                  className={`module${changed ? ' module--changed' : ''}`}
                  style={{ animationDelay: `${i * 55}ms` }}
                >
              <div className="idx">{String(i + 1).padStart(2, '0')}</div>

              <div className="body">
                <div className="labelrow">
                  <span className="label">{f.label}</span>
                  {!f.options && <span className="unit">{f.unit}</span>}
                  {changed && <span className="dot" title="Unsaved change" />}
                </div>
                <p className="explain">{f.explain}</p>
                <div className="meta">
                  <span>
                    default{' '}
                    <b>
                      {f.options
                        ? (f.options.find(o => o.value === DEFAULT_BOT_SETTINGS[f.key])?.label ??
                          fmt(DEFAULT_BOT_SETTINGS[f.key]))
                        : fmt(DEFAULT_BOT_SETTINGS[f.key] * f.scale)}
                    </b>
                    {atDefault && <span className="tag">in use</span>}
                  </span>
                  {!f.options && (
                    <span>
                      range <b>{fmt(b.min * f.scale)}</b>&ndash;<b>{fmt(b.max * f.scale)}</b>
                    </span>
                  )}
                </div>
              </div>

              {f.options ? (
                <div className="selectwrap">
                  <select
                    aria-label={f.label}
                    value={values[f.key]}
                    onChange={e => setField(f, Number(e.target.value) * f.scale)}
                  >
                    {!f.options.some(o => o.value === values[f.key]) && (
                      <option value={values[f.key]}>{fmt(values[f.key])} min (custom)</option>
                    )}
                    {f.options.map(o => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="stepper">
                  <button
                    type="button"
                    aria-label={`Decrease ${f.label}`}
                    onClick={() => setField(f, display - f.step)}
                  >
                    &minus;
                  </button>
                  <input
                    type="number"
                    step={f.step}
                    min={b.min * f.scale}
                    max={b.max * f.scale}
                    value={Number.isFinite(display) ? display : ''}
                    onChange={e => setField(f, Number(e.target.value))}
                  />
                  <button
                    type="button"
                    aria-label={`Increase ${f.label}`}
                    onClick={() => setField(f, display + f.step)}
                  >
                    +
                  </button>
                </div>
              )}
                </section>
              )
            })}
          </div>
        ))}
      </div>

      <footer className="savebar">
        <div className="state">
          <span className={`pip${dirty ? ' pip--on' : ''}`} />
          <span className="statetext">
            {status ? (
              <span className={status.kind === 'ok' ? 'ok' : 'err'}>{status.text}</span>
            ) : dirty ? (
              'Unsaved changes'
            ) : (
              'All changes saved'
            )}
          </span>
        </div>
        <div className="actions">
          {dirty && (
            <button type="button" className="ghost" disabled={pending} onClick={() => setValues(saved)}>
              Discard
            </button>
          )}
          <button type="button" className="primary" disabled={pending || !dirty} onClick={save}>
            {pending ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </footer>

      <style jsx>{`
        .panel {
          --mono: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace;
          max-width: 720px;
          margin: 0 auto;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r);
          overflow: hidden;
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.02) inset, 0 24px 60px -30px rgba(0, 0, 0, 0.8);
        }

        .phead {
          padding: 22px 24px 20px;
          border-bottom: 1px solid var(--border);
          background:
            radial-gradient(120% 140% at 100% 0%, color-mix(in oklch, var(--accent) 9%, transparent), transparent 60%),
            var(--sf2);
        }
        .eyebrow {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.32em;
          text-transform: uppercase;
          color: var(--accent);
        }
        .ptitle {
          margin: 8px 0 6px;
          font-size: 21px;
          font-weight: 650;
          letter-spacing: -0.015em;
          color: var(--fg);
        }
        .psub {
          margin: 0;
          font-size: 11.5px;
          line-height: 1.6;
          color: var(--muted);
          max-width: 56ch;
        }
        .psub code {
          font-family: var(--mono);
          font-size: 10.5px;
          color: var(--fg);
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 3px;
          padding: 1px 5px;
        }

        .modules {
          display: flex;
          flex-direction: column;
        }
        .grouphead {
          display: flex;
          align-items: baseline;
          gap: 10px;
          flex-wrap: wrap;
          padding: 13px 24px 11px;
          background: var(--bg);
          border-bottom: 1px solid var(--border);
        }
        .gname {
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--accent);
        }
        .ghint {
          font-size: 10.5px;
          color: var(--muted);
        }
        .group:last-child .module:last-child {
          border-bottom: none;
        }
        .module {
          position: relative;
          display: grid;
          grid-template-columns: 34px 1fr auto;
          gap: 16px;
          padding: 15px 24px;
          border-bottom: 1px solid var(--border);
          opacity: 0;
          transform: translateY(6px);
          animation: rise 0.4s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
        }
        @keyframes rise {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .module::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 2px;
          background: var(--accent);
          opacity: 0;
          transition: opacity 0.18s;
        }
        .module--changed::before {
          opacity: 1;
        }

        .idx {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--muted);
          padding-top: 2px;
          letter-spacing: 0.04em;
        }

        .labelrow {
          display: flex;
          align-items: baseline;
          gap: 9px;
        }
        .label {
          font-size: 13px;
          font-weight: 640;
          color: var(--fg);
          letter-spacing: -0.01em;
        }
        .unit {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          color: var(--muted);
        }
        .dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 0 8px var(--accent);
          align-self: center;
        }

        .explain {
          margin: 6px 0 0;
          font-size: 11.5px;
          line-height: 1.5;
          color: var(--muted);
          max-width: 52ch;
        }

        .meta {
          margin-top: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.03em;
          color: var(--muted);
          text-transform: uppercase;
        }
        .meta b {
          color: var(--fg);
          font-weight: 600;
        }
        .tag {
          margin-left: 6px;
          color: var(--accent);
          border: 1px solid color-mix(in oklch, var(--accent) 35%, transparent);
          border-radius: 3px;
          padding: 0 4px;
          font-size: 9px;
        }

        .stepper {
          display: flex;
          align-items: center;
          height: 34px;
          align-self: start;
          border: 1px solid var(--border);
          border-radius: var(--r);
          background: var(--bg);
          overflow: hidden;
          transition: border-color 0.16s, box-shadow 0.16s;
        }
        .stepper:focus-within {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px color-mix(in oklch, var(--accent) 16%, transparent);
        }
        .stepper button {
          width: 30px;
          height: 100%;
          border: none;
          background: var(--sf2);
          color: var(--muted);
          font-size: 15px;
          cursor: pointer;
          transition: background 0.14s, color 0.14s;
        }
        .stepper button:hover {
          background: color-mix(in oklch, var(--accent) 14%, var(--sf2));
          color: var(--accent);
        }
        .stepper button:active {
          background: color-mix(in oklch, var(--accent) 26%, var(--sf2));
        }
        .stepper input {
          width: 76px;
          height: 100%;
          border: none;
          border-left: 1px solid var(--border);
          border-right: 1px solid var(--border);
          background: transparent;
          color: var(--fg);
          text-align: center;
          font-family: var(--mono);
          font-size: 13px;
          font-variant-numeric: tabular-nums;
        }
        .stepper input:focus {
          outline: none;
        }
        .stepper input::-webkit-outer-spin-button,
        .stepper input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .stepper input[type='number'] {
          -moz-appearance: textfield;
        }

        .selectwrap {
          position: relative;
          align-self: start;
        }
        .selectwrap select {
          height: 34px;
          appearance: none;
          -webkit-appearance: none;
          padding: 0 32px 0 12px;
          border: 1px solid var(--border);
          border-radius: var(--r);
          background: var(--bg);
          color: var(--fg);
          font-family: var(--mono);
          font-size: 12px;
          cursor: pointer;
          transition: border-color 0.16s, box-shadow 0.16s;
        }
        .selectwrap select:hover {
          border-color: var(--muted);
        }
        .selectwrap select:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px color-mix(in oklch, var(--accent) 16%, transparent);
        }
        .selectwrap select option {
          background: var(--surface);
          color: var(--fg);
        }
        .selectwrap::after {
          content: '';
          position: absolute;
          right: 13px;
          top: 50%;
          width: 6px;
          height: 6px;
          border-right: 1.5px solid var(--muted);
          border-bottom: 1.5px solid var(--muted);
          transform: translateY(-72%) rotate(45deg);
          pointer-events: none;
        }

        .savebar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 14px 24px;
          background: var(--sf2);
          position: sticky;
          bottom: 0;
        }
        .state {
          display: flex;
          align-items: center;
          gap: 9px;
          min-width: 0;
        }
        .pip {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--muted);
          flex-shrink: 0;
          transition: background 0.18s, box-shadow 0.18s;
        }
        .pip--on {
          background: var(--warn);
          box-shadow: 0 0 9px color-mix(in oklch, var(--warn) 70%, transparent);
        }
        .statetext {
          font-size: 11px;
          color: var(--muted);
          font-family: var(--mono);
          letter-spacing: 0.02em;
        }
        .statetext .ok {
          color: var(--pos);
        }
        .statetext .err {
          color: var(--neg);
        }

        .actions {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
        }
        .actions button {
          height: 32px;
          padding: 0 16px;
          border-radius: var(--r);
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.12s, background 0.14s, opacity 0.14s, box-shadow 0.14s;
        }
        .actions button:disabled {
          cursor: not-allowed;
          opacity: 0.4;
        }
        .ghost {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--muted);
        }
        .ghost:hover:not(:disabled) {
          color: var(--fg);
          border-color: var(--muted);
        }
        .primary {
          background: var(--accent);
          border: 1px solid var(--accent);
          color: #04140d;
          letter-spacing: 0.01em;
        }
        .primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 18px -6px color-mix(in oklch, var(--accent) 70%, transparent);
        }
        .primary:active:not(:disabled) {
          transform: translateY(0);
        }

        @media (max-width: 560px) {
          .module {
            grid-template-columns: 1fr;
            gap: 10px;
          }
          .idx {
            display: none;
          }
          .stepper {
            justify-self: start;
          }
        }
      `}</style>
    </div>
  )
}

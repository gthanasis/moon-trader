'use client'

import { useMemo, useRef, useState } from 'react'
import {
  type BotSettings,
  type StrategyPreset,
  type PresetSettings,
  BOT_SETTINGS_BOUNDS,
  DEFAULT_BOT_SETTINGS,
  PROMPT_PLACEHOLDERS,
  PROMPT_MAX_LENGTH,
  CORE_SYSTEM_RULES,
  STRATEGY_PRESETS,
} from '@api/common'
import { usePaused, useSetPaused, useSaveSettings } from '@/lib/queries'
import { Select } from '@/components/ui/select'
import { NumberStepper } from '@/components/ui/number-stepper'

/**
 * Per-field display metadata. `scale` converts the stored value to what the
 * user sees: fraction fields (0.01) are shown as percentages (1).
 */
interface FieldDef {
  key: keyof typeof BOT_SETTINGS_BOUNDS
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

// Ordered to match GROUPS below; the flat index drives the row numbering.
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
  {
    key: 'takeProfitTierPct',
    label: 'Take-profit tier',
    unit: '%',
    scale: 100,
    step: 5,
    explain: 'How much of a position is banked the first time it hits take-profit; the rest rides the trailing stop. Set 100% to exit the whole position at once.',
  },
]

/** Logical sections shown on the page, in render order. */
const GROUPS: { name: string; hint: string; keys: FieldDef['key'][] }[] = [
  { name: 'Schedule', hint: 'How often the bot evaluates the market', keys: ['runIntervalMinutes'] },
  {
    name: 'Decision & approval',
    hint: 'What the bot acts on, and when you stay in the loop',
    keys: ['minConfidence', 'autoTradeLimit'],
  },
  {
    name: 'Risk controls',
    hint: 'Limits that protect your capital',
    keys: ['riskPerTradePct', 'maxPositions', 'dailyLossLimitPct', 'takeProfitTierPct'],
  },
]

const FIELD_BY_KEY = Object.fromEntries(FIELDS.map(f => [f.key, f])) as Record<FieldDef['key'], FieldDef>

// The Bot group occupies the first two row numbers; numeric fields follow.
const BOT_ROW_COUNT = 2

const fmt = (n: number) => String(Math.round(n * 1e4) / 1e4)
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** A small sliding on/off switch. */
function Switch({
  on,
  onClick,
  disabled,
  tone = 'accent',
}: {
  on: boolean
  onClick: () => void
  disabled?: boolean
  /** `accent` for neutral toggles, `warn` when the "on" state carries risk. */
  tone?: 'accent' | 'warn'
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className="relative h-[22px] w-[40px] shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        borderColor: on ? `var(--${tone})` : 'var(--border)',
        background: on ? `color-mix(in oklch, var(--${tone}) 28%, transparent)` : 'var(--bg)',
      }}
    >
      <span
        className="absolute top-1/2 h-[14px] w-[14px] -translate-y-1/2 rounded-full transition-all"
        style={{
          left: on ? '21px' : '3px',
          background: on ? `var(--${tone})` : 'var(--muted)',
          boxShadow: on ? `0 0 8px var(--${tone})` : 'none',
        }}
      />
    </button>
  )
}

const PLACEHOLDER_NAMES = new Set<string>(PROMPT_PLACEHOLDERS.map(p => p.name))

/** Distinct `{token}`s in the template that aren't recognised placeholders. */
function unknownTokens(template: string): string[] {
  const found = template.match(/\{\w+\}/g) ?? []
  return [...new Set(found.filter(t => !PLACEHOLDER_NAMES.has(t.slice(1, -1))))]
}

/** First flat row number used by the prompt section (continues numeric fields). */
const PROMPT_ROW_START = FIELDS.length + BOT_ROW_COUNT

/** One editable prompt textarea with a row number, label, hint and change dot. */
function PromptField({
  row,
  label,
  hint,
  value,
  onChange,
  changed,
  atDefault,
  onReset,
  textareaRef,
  children,
}: {
  row: number
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  changed: boolean
  /** True when the value already equals the shipped default. */
  atDefault: boolean
  /** Restores the field to its shipped default. */
  onReset: () => void
  textareaRef?: React.RefObject<HTMLTextAreaElement>
  /** Optional extra controls (placeholder chips) rendered under the textarea. */
  children?: React.ReactNode
}) {
  const over = value.length > PROMPT_MAX_LENGTH
  return (
    <section className="relative grid grid-cols-[34px_1fr] gap-4 border-b border-border px-6 py-[15px] max-[560px]:grid-cols-1 max-[560px]:gap-2.5">
      {changed && <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
      <div className="pt-0.5 font-mono text-sm tracking-[0.04em] text-muted max-[560px]:hidden">
        {String(row).padStart(2, '0')}
      </div>
      <div>
        <div className="flex items-baseline gap-[9px]">
          <span className="text-[13px] font-[640] tracking-[-0.01em] text-fg">{label}</span>
          {changed && (
            <span
              title="Unsaved change"
              className="h-[5px] w-[5px] self-center rounded-full bg-accent shadow-[0_0_8px_var(--accent)]"
            />
          )}
          <button
            type="button"
            disabled={atDefault}
            onClick={onReset}
            className="ml-auto cursor-pointer rounded-sm border border-border bg-transparent px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {atDefault ? 'at default' : 'reset to default'}
          </button>
        </div>
        <p className="mt-1.5 max-w-[56ch] text-[11.5px] leading-[1.5] text-muted">{hint}</p>
        <textarea
          ref={textareaRef}
          aria-label={label}
          value={value}
          onChange={e => onChange(e.target.value)}
          spellCheck={false}
          rows={8}
          className="mt-2.5 w-full resize-y rounded border bg-bg px-3 py-2 font-mono text-[11.5px] leading-[1.55] text-fg outline-none focus:border-accent"
          style={{ borderColor: over ? 'var(--neg)' : 'var(--border)' }}
        />
        <div className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-[0.04em]">
          <span className="text-muted">drop or click a chip to insert</span>
          <span style={{ color: over ? 'var(--neg)' : 'var(--muted)' }}>
            {value.length} / {PROMPT_MAX_LENGTH}
          </span>
        </div>
        {children}
      </div>
    </section>
  )
}

/** Cards that apply a ready-made strategy preset to the whole form at once. */
function PresetPicker({
  values,
  onApply,
}: {
  values: BotSettings
  onApply: (preset: StrategyPreset) => void
}) {
  // A preset is "in use" when every field it sets already matches the form.
  const activeId =
    STRATEGY_PRESETS.find(p =>
      (Object.keys(p.settings) as (keyof PresetSettings)[]).every(k => values[k] === p.settings[k]),
    )?.id ?? null

  return (
    <div className="grid gap-2.5 px-6 py-[15px] sm:grid-cols-3 max-[560px]:grid-cols-1">
      {STRATEGY_PRESETS.map(p => {
        const active = p.id === activeId
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onApply(p)}
            className="flex cursor-pointer flex-col gap-1.5 rounded border bg-bg p-3 text-left transition-colors hover:border-accent"
            style={{ borderColor: active ? 'var(--accent)' : 'var(--border)' }}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-fg">
                {p.name}
              </span>
              {active && (
                <span className="rounded-sm border border-[color-mix(in_oklch,var(--accent)_35%,transparent)] px-1 text-[9px] uppercase text-accent">
                  in use
                </span>
              )}
            </div>
            <span className="text-[11px] font-[560] leading-[1.4] text-accent">{p.tagline}</span>
            <p className="m-0 text-[10.5px] leading-[1.5] text-muted">{p.description}</p>
          </button>
        )
      })}
    </div>
  )
}

export function SettingsForm({ initial }: { initial: BotSettings }) {
  const [saved, setSaved] = useState<BotSettings>(initial)
  const [values, setValues] = useState<BotSettings>(initial)
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const saveSettings = useSaveSettings()
  const pending = saveSettings.isPending

  // Bot power lives in the separate `paused` BotState key and applies
  // immediately — it is not part of the save/discard form flow.
  const pausedQuery = usePaused()
  const paused = pausedQuery.data?.paused ?? null
  const setPausedMutation = useSetPaused()

  // When set, the "enable real trading" confirmation modal is open.
  const [confirmReal, setConfirmReal] = useState(false)

  const dirty = useMemo(
    () =>
      FIELDS.some(f => values[f.key] !== saved[f.key]) ||
      values.paperMode !== saved.paperMode ||
      values.strategyPrompt !== saved.strategyPrompt ||
      values.promptTemplate !== saved.promptTemplate,
    [values, saved],
  )

  // Ref to the data-template textarea so chip clicks insert at the caret.
  const templateRef = useRef<HTMLTextAreaElement>(null)

  /** Inserts a `{name}` token at the template caret (or appends on click). */
  const insertPlaceholder = (name: string) => {
    const token = `{${name}}`
    const el = templateRef.current
    setStatus(null)
    setValues(v => {
      const text = v.promptTemplate
      const start = el?.selectionStart ?? text.length
      const end = el?.selectionEnd ?? text.length
      return { ...v, promptTemplate: text.slice(0, start) + token + text.slice(end) }
    })
    // Restore focus and place the caret after the inserted token.
    requestAnimationFrame(() => {
      if (!el) return
      const pos = (el.selectionStart ?? el.value.length) + token.length
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  const badTokens = unknownTokens(values.promptTemplate)
  const promptsTooLong =
    values.strategyPrompt.length > PROMPT_MAX_LENGTH || values.promptTemplate.length > PROMPT_MAX_LENGTH

  /** Loads a preset's prompt + parameters into the form as unsaved changes. */
  const applyPreset = (preset: StrategyPreset) => {
    setStatus(null)
    setValues(v => ({ ...v, ...preset.settings }))
  }

  const setField = (f: FieldDef, displayVal: number) => {
    if (!Number.isFinite(displayVal)) return
    const b = BOT_SETTINGS_BOUNDS[f.key]
    const stored = clamp(displayVal / f.scale, b.min, b.max)
    setValues(v => ({ ...v, [f.key]: Math.round(stored * 1e6) / 1e6 }))
    setStatus(null)
  }

  /** Paper → Real opens a confirmation; Real → Paper applies straight away. */
  const requestModeChange = (toPaper: boolean) => {
    setStatus(null)
    if (toPaper) {
      setValues(v => ({ ...v, paperMode: true }))
    } else {
      setConfirmReal(true)
    }
  }

  const pauseBusy = setPausedMutation.isPending

  const togglePaused = () => {
    if (paused === null || pauseBusy) return
    setPausedMutation.mutate(!paused)
  }

  const save = () => {
    setStatus(null)
    saveSettings.mutate(values, {
      onSuccess: result => {
        setSaved(result)
        setValues(result)
        setStatus({ kind: 'ok', text: 'Saved. The bot applies this on its next cycle.' })
      },
      onError: () => {
        setStatus({ kind: 'error', text: 'Save failed. Check the connection and retry.' })
      },
    })
  }

  const modeChanged = values.paperMode !== saved.paperMode

  return (
    <div className="mx-auto max-w-[720px] overflow-hidden rounded border border-border bg-surface shadow-[0_24px_60px_-30px_rgba(0,0,0,0.8)]">
      {/* header */}
      <header
        className="border-b border-border px-6 pb-5 pt-[22px]"
        style={{
          background:
            'radial-gradient(120% 140% at 100% 0%, color-mix(in oklch, var(--accent) 9%, transparent), transparent 60%), var(--sf2)',
        }}
      >
        <div className="font-mono text-xs uppercase tracking-[0.32em] text-accent">
          /&nbsp;/&nbsp;&nbsp;control&nbsp;panel
        </div>
        <h1 className="mb-1.5 mt-2 text-[21px] font-[650] tracking-[-0.015em] text-fg">Bot Settings</h1>
        <p className="m-0 max-w-[56ch] text-[11.5px] leading-[1.6] text-muted">
          Live trading parameters. Saved values are re-read at the start of every evaluation cycle
          &mdash; no restart needed. API keys, traded coins and the candle timeframe live in{' '}
          <code className="rounded-sm border border-border bg-bg px-[5px] py-px font-mono text-[10.5px] text-fg">
            .env
          </code>{' '}
          and are not editable here.
        </p>
      </header>

      <div className="flex flex-col">
        {/* Strategy presets — apply a ready-made prompt + parameter bundle */}
        <div>
          <div className="flex flex-wrap items-baseline gap-2.5 border-b border-border bg-bg px-6 pb-[11px] pt-[13px]">
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              Strategy presets
            </span>
            <span className="text-[10.5px] text-muted">
              Apply a ready-made strategy, then fine-tune below — applies as an unsaved change
            </span>
          </div>
          <PresetPicker values={values} onApply={applyPreset} />
        </div>

        {/* Bot — power and trading mode */}
        <div>
          <div className="flex flex-wrap items-baseline gap-2.5 border-b border-border bg-bg px-6 pb-[11px] pt-[13px]">
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-accent">Bot</span>
            <span className="text-[10.5px] text-muted">Trading power and how orders are routed</span>
          </div>

          {/* 01 — bot power */}
          <section className="grid grid-cols-[34px_1fr_auto] gap-4 border-b border-border px-6 py-[15px] max-[560px]:grid-cols-1 max-[560px]:gap-2.5">
            <div className="pt-0.5 font-mono text-sm tracking-[0.04em] text-muted max-[560px]:hidden">01</div>
            <div>
              <div className="flex items-baseline gap-[9px]">
                <span className="text-[13px] font-[640] tracking-[-0.01em] text-fg">Bot power</span>
                <span
                  className="font-mono text-xs uppercase tracking-[0.06em]"
                  style={{ color: paused === null ? 'var(--muted)' : paused ? 'var(--neg)' : 'var(--pos)' }}
                >
                  {paused === null ? '…' : paused ? 'off' : 'on'}
                </span>
              </div>
              <p className="mt-1.5 max-w-[52ch] text-[11.5px] leading-[1.5] text-muted">
                When off, the bot evaluates nothing and places no orders. Turn it on to resume the
                schedule. Applies immediately — no save needed.
              </p>
            </div>
            <Switch
              on={paused === false}
              disabled={paused === null || pauseBusy}
              onClick={togglePaused}
            />
          </section>

          {/* 02 — trading mode */}
          <section className="relative grid grid-cols-[34px_1fr_auto] gap-4 border-b border-border px-6 py-[15px] max-[560px]:grid-cols-1 max-[560px]:gap-2.5">
            {modeChanged && <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
            <div className="pt-0.5 font-mono text-sm tracking-[0.04em] text-muted max-[560px]:hidden">02</div>
            <div>
              <div className="flex items-baseline gap-[9px]">
                <span className="text-[13px] font-[640] tracking-[-0.01em] text-fg">Trading mode</span>
                <span
                  className="font-mono text-xs uppercase tracking-[0.06em]"
                  style={{ color: values.paperMode ? 'var(--muted)' : 'var(--warn)' }}
                >
                  {values.paperMode ? 'paper' : 'real'}
                </span>
                {modeChanged && (
                  <span
                    title="Unsaved change"
                    className="h-[5px] w-[5px] self-center rounded-full bg-accent shadow-[0_0_8px_var(--accent)]"
                  />
                )}
              </div>
              <p className="mt-1.5 max-w-[52ch] text-[11.5px] leading-[1.5] text-muted">
                Paper simulates every fill — no real money moves. Real places live orders on Binance
                with your funds. Switching to real asks for confirmation first.
              </p>
            </div>
            <Switch
              on={!values.paperMode}
              tone="warn"
              onClick={() => requestModeChange(!values.paperMode)}
            />
          </section>
        </div>

        {/* grouped numeric settings */}
        {GROUPS.map(group => (
          <div key={group.name}>
            <div className="flex flex-wrap items-baseline gap-2.5 border-b border-border bg-bg px-6 pb-[11px] pt-[13px]">
              <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                {group.name}
              </span>
              <span className="text-[10.5px] text-muted">{group.hint}</span>
            </div>

            {group.keys.map(key => {
              const f = FIELD_BY_KEY[key]
              const i = FIELDS.indexOf(f) + BOT_ROW_COUNT
              const b = BOT_SETTINGS_BOUNDS[f.key]
              const display = values[f.key] * f.scale
              const changed = values[f.key] !== saved[f.key]
              const atDefault = values[f.key] === DEFAULT_BOT_SETTINGS[f.key]
              return (
                <section
                  key={f.key}
                  className="relative grid grid-cols-[34px_1fr_auto] gap-4 border-b border-border px-6 py-[15px] max-[560px]:grid-cols-1 max-[560px]:gap-2.5"
                >
                  {changed && <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}

                  <div className="pt-0.5 font-mono text-sm tracking-[0.04em] text-muted max-[560px]:hidden">
                    {String(i + 1).padStart(2, '0')}
                  </div>

                  <div>
                    <div className="flex items-baseline gap-[9px]">
                      <span className="text-[13px] font-[640] tracking-[-0.01em] text-fg">{f.label}</span>
                      {!f.options && (
                        <span className="font-mono text-xs tracking-[0.06em] text-muted">{f.unit}</span>
                      )}
                      {changed && (
                        <span
                          title="Unsaved change"
                          className="h-[5px] w-[5px] self-center rounded-full bg-accent shadow-[0_0_8px_var(--accent)]"
                        />
                      )}
                    </div>
                    <p className="mt-1.5 max-w-[52ch] text-[11.5px] leading-[1.5] text-muted">{f.explain}</p>
                    <div className="mt-2 flex flex-wrap gap-3.5 font-mono text-xs uppercase tracking-[0.03em] text-muted">
                      <span>
                        default{' '}
                        <b className="font-semibold text-fg">
                          {f.options
                            ? (f.options.find(o => o.value === DEFAULT_BOT_SETTINGS[f.key])?.label ??
                              fmt(DEFAULT_BOT_SETTINGS[f.key]))
                            : fmt(DEFAULT_BOT_SETTINGS[f.key] * f.scale)}
                        </b>
                        {atDefault && (
                          <span className="ml-1.5 rounded-sm border border-[color-mix(in_oklch,var(--accent)_35%,transparent)] px-1 text-[9px] text-accent">
                            in use
                          </span>
                        )}
                      </span>
                      {!f.options && (
                        <span>
                          range <b className="font-semibold text-fg">{fmt(b.min * f.scale)}</b>&ndash;
                          <b className="font-semibold text-fg">{fmt(b.max * f.scale)}</b>
                        </span>
                      )}
                    </div>
                  </div>

                  {f.options ? (
                    <Select
                      aria-label={f.label}
                      className="self-start max-[560px]:justify-self-start"
                      value={values[f.key]}
                      options={
                        f.options.some(o => o.value === values[f.key])
                          ? f.options
                          : [{ value: values[f.key], label: `${fmt(values[f.key])} min (custom)` }, ...f.options]
                      }
                      onChange={v => setField(f, Number(v) * f.scale)}
                    />
                  ) : (
                    <NumberStepper
                      label={f.label}
                      className="self-start max-[560px]:justify-self-start"
                      value={display}
                      min={b.min * f.scale}
                      max={b.max * f.scale}
                      step={f.step}
                      onChange={n => setField(f, n)}
                    />
                  )}
                </section>
              )
            })}
          </div>
        ))}

        {/* Prompt — editable strategy text and data template */}
        <div>
          <div className="flex flex-wrap items-baseline gap-2.5 border-b border-border bg-bg px-6 pb-[11px] pt-[13px]">
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-accent">Prompt</span>
            <span className="text-[10.5px] text-muted">
              What the bot is told each cycle — strategy and the data it sees
            </span>
          </div>

          <PromptField
            row={PROMPT_ROW_START + 1}
            label="Strategy instructions"
            hint="Free-form persona and strategy text sent at the top of the system prompt. The locked core rules below are always appended after it."
            value={values.strategyPrompt}
            changed={values.strategyPrompt !== saved.strategyPrompt}
            atDefault={values.strategyPrompt === DEFAULT_BOT_SETTINGS.strategyPrompt}
            onReset={() => {
              setStatus(null)
              setValues(prev => ({ ...prev, strategyPrompt: DEFAULT_BOT_SETTINGS.strategyPrompt }))
            }}
            onChange={v => {
              setStatus(null)
              setValues(prev => ({ ...prev, strategyPrompt: v }))
            }}
          >
            <div className="mt-3 rounded border border-border bg-bg px-3 py-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                Locked core rules — always appended, not editable
              </div>
              <pre className="mt-1.5 m-0 whitespace-pre-wrap font-mono text-[10.5px] leading-[1.5] text-muted">
                {CORE_SYSTEM_RULES}
              </pre>
            </div>
          </PromptField>

          <PromptField
            row={PROMPT_ROW_START + 2}
            label="Data template"
            hint="The user message. Drag or click a chip to drop live data in. Unknown {tokens} are sent as-is."
            value={values.promptTemplate}
            changed={values.promptTemplate !== saved.promptTemplate}
            atDefault={values.promptTemplate === DEFAULT_BOT_SETTINGS.promptTemplate}
            onReset={() => {
              setStatus(null)
              setValues(prev => ({ ...prev, promptTemplate: DEFAULT_BOT_SETTINGS.promptTemplate }))
            }}
            textareaRef={templateRef}
            onChange={v => {
              setStatus(null)
              setValues(prev => ({ ...prev, promptTemplate: v }))
            }}
          >
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {PROMPT_PLACEHOLDERS.map(p => (
                <button
                  key={p.name}
                  type="button"
                  draggable
                  title={p.description}
                  onDragStart={e => e.dataTransfer.setData('text/plain', `{${p.name}}`)}
                  onClick={() => insertPlaceholder(p.name)}
                  className="cursor-grab rounded-sm border border-border bg-bg px-2 py-1 font-mono text-[10.5px] text-accent transition-colors hover:border-accent active:cursor-grabbing"
                >
                  {`{${p.name}}`}
                </button>
              ))}
            </div>
            {badTokens.length > 0 && (
              <p className="mt-2 font-mono text-[10.5px] text-warn">
                Unrecognised, sent literally: {badTokens.join(' ')}
              </p>
            )}
          </PromptField>
        </div>
      </div>

      {/* save bar */}
      <footer className="sticky bottom-0 flex items-center justify-between gap-4 bg-sf2 px-6 py-3.5">
        <div className="flex min-w-0 items-center gap-[9px]">
          <span
            className={`h-[7px] w-[7px] shrink-0 rounded-full transition-all ${
              dirty
                ? 'bg-warn shadow-[0_0_9px_color-mix(in_oklch,var(--warn)_70%,transparent)]'
                : 'bg-muted'
            }`}
          />
          <span className="font-mono text-sm tracking-[0.02em] text-muted">
            {status ? (
              <span className={status.kind === 'ok' ? 'text-pos' : 'text-neg'}>{status.text}</span>
            ) : dirty ? (
              'Unsaved changes'
            ) : (
              'All changes saved'
            )}
          </span>
        </div>
        <div className="flex shrink-0 gap-2">
          {dirty && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setValues(saved)}
              className="h-8 cursor-pointer rounded border border-border bg-transparent px-4 text-[11.5px] font-semibold text-muted transition-colors enabled:hover:border-muted enabled:hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
            >
              Discard
            </button>
          )}
          <button
            type="button"
            disabled={pending || !dirty || promptsTooLong}
            onClick={save}
            className="h-8 cursor-pointer rounded border border-accent bg-accent px-4 text-[11.5px] font-semibold tracking-[0.01em] text-[#04140d] transition-all enabled:hover:-translate-y-px enabled:hover:shadow-[0_6px_18px_-6px_color-mix(in_oklch,var(--accent)_70%,transparent)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </footer>

      {/* enable-real-trading confirmation */}
      {confirmReal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setConfirmReal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-real-title"
            onClick={e => e.stopPropagation()}
            className="w-full max-w-[440px] overflow-hidden rounded border border-warn bg-surface shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]"
          >
            <div
              className="border-b border-border px-5 pb-3.5 pt-4"
              style={{
                background:
                  'radial-gradient(120% 140% at 100% 0%, color-mix(in oklch, var(--warn) 14%, transparent), transparent 60%), var(--sf2)',
              }}
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-warn">
                /&nbsp;/&nbsp;&nbsp;confirm
              </div>
              <h2 id="confirm-real-title" className="mt-1.5 text-[16px] font-[650] tracking-[-0.01em] text-fg">
                Switch to real trading?
              </h2>
            </div>

            <div className="px-5 py-4 text-[12px] leading-[1.6] text-muted">
              <p className="m-0">
                Real mode places <b className="text-fg">live orders on Binance using your own funds</b>.
                Fills are no longer simulated — the bot can buy and sell for real money.
              </p>
              <ul className="mt-3 flex flex-col gap-1.5 pl-4">
                <li>The change takes effect after you press <b className="text-fg">Save settings</b>.</li>
                <li>It applies on the bot&rsquo;s next evaluation cycle.</li>
                <li>Open paper positions are not migrated — only new orders route to the exchange.</li>
                <li>You can switch back to paper at any time.</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2 border-t border-border bg-sf2 px-5 py-3">
              <button
                type="button"
                onClick={() => setConfirmReal(false)}
                className="h-8 cursor-pointer rounded border border-border bg-transparent px-4 text-[11.5px] font-semibold text-muted transition-colors hover:border-muted hover:text-fg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setValues(v => ({ ...v, paperMode: false }))
                  setConfirmReal(false)
                }}
                className="h-8 cursor-pointer rounded border border-warn bg-warn px-4 text-[11.5px] font-semibold tracking-[0.01em] text-[#1a0d00] transition-all hover:-translate-y-px"
              >
                Enable real trading
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

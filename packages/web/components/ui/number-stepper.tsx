import { cn } from '@/lib/utils'

interface NumberStepperProps {
  value: number
  min: number
  max: number
  step: number
  /** Used for the −/+ button aria-labels, e.g. "Decrease Risk per trade". */
  label: string
  /** Receives the new value, already clamped to [min, max]. */
  onChange: (value: number) => void
  /** Applied to the wrapper — use for layout (e.g. `self-start`). */
  className?: string
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

const BTN =
  'h-full w-[30px] cursor-pointer bg-sf2 text-[15px] text-muted transition-colors hover:bg-[color-mix(in_oklch,var(--accent)_14%,var(--sf2))] hover:text-accent active:bg-[color-mix(in_oklch,var(--accent)_26%,var(--sf2))]'

/** Themed numeric input with −/+ steppers. Emits values clamped to [min, max]. */
export function NumberStepper({ value, min, max, step, label, onChange, className }: NumberStepperProps) {
  const emit = (n: number) => {
    if (Number.isFinite(n)) onChange(clamp(n, min, max))
  }
  return (
    <div
      className={cn(
        'flex h-[34px] items-center overflow-hidden rounded border border-border bg-bg transition-all focus-within:border-accent focus-within:shadow-[0_0_0_3px_color-mix(in_oklch,var(--accent)_16%,transparent)]',
        className,
      )}
    >
      <button type="button" aria-label={`Decrease ${label}`} className={BTN} onClick={() => emit(value - step)}>
        &minus;
      </button>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ''}
        onChange={e => emit(Number(e.target.value))}
        className="h-full w-[76px] border-x border-border bg-transparent text-center font-mono text-[13px] tabular-nums text-fg outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" aria-label={`Increase ${label}`} className={BTN} onClick={() => emit(value + step)}>
        +
      </button>
    </div>
  )
}

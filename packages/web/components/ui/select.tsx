import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string | number
  label: string
}

interface SelectProps {
  value: string | number
  options: SelectOption[]
  /** Receives the raw string value of the chosen <option>. */
  onChange: (value: string) => void
  'aria-label'?: string
  /** Applied to the wrapper — use for layout (e.g. `self-start`). */
  className?: string
}

/**
 * Themed native <select>. Keeps native accessibility and the OS option menu;
 * only the closed control is styled (a native select's open list can't be).
 */
export function Select({ value, options, onChange, className, ...rest }: SelectProps) {
  return (
    <div className={cn('relative inline-block', className)}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-[34px] cursor-pointer appearance-none rounded border border-border bg-bg pl-3 pr-8 font-mono text-base text-fg outline-none transition-colors hover:border-muted focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_oklch,var(--accent)_16%,transparent)]"
        {...rest}
      >
        {options.map(o => (
          <option key={o.value} value={o.value} className="bg-surface text-fg">
            {o.label}
          </option>
        ))}
      </select>
      {/* chevron */}
      <span className="pointer-events-none absolute right-[13px] top-1/2 h-1.5 w-1.5 -translate-y-[72%] rotate-45 border-b-[1.5px] border-r-[1.5px] border-muted" />
    </div>
  )
}

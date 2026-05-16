import { cn } from '@/lib/utils'
import { Slot } from '@radix-ui/react-slot'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive'
  asChild?: boolean
}

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  default: 'bg-accent text-bg hover:brightness-110',
  outline: 'border border-border bg-transparent text-fg hover:bg-sf2',
  secondary: 'bg-sf2 text-fg hover:brightness-125',
  ghost: 'text-muted hover:bg-sf2 hover:text-fg',
  destructive: 'bg-neg text-white hover:brightness-110',
}

export function Button({ className, variant = 'default', asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      className={cn(
        'inline-flex h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-[filter,background-color,color] disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  )
}

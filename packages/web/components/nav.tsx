import Link from 'next/link'

const links = [
  { href: '/', label: 'Overview' },
  { href: '/positions', label: 'Positions' },
  { href: '/trades', label: 'Trade History' },
  { href: '/backtest', label: 'Backtest' },
]

export function Nav() {
  return (
    <nav className="flex flex-col gap-1 p-4 border-r min-h-screen w-48">
      <span className="text-lg font-semibold mb-4 px-2">Trader</span>
      {links.map(link => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}

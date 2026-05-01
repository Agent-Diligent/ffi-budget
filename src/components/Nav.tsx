'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/dashboard',    label: 'Dashboard' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/cc',           label: 'CC Tracker' },
  { href: '/history',      label: 'History' },
]

export default function Nav() {
  const path = usePathname()
  return (
    <nav className="bg-surface border-b border-border sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
        <div>
          <span className="font-bold text-text-primary text-base">FFI Budget</span>
          <span className="text-text-muted text-xs ml-2 hidden sm:inline">Freedom Foundation Industries</span>
        </div>
        <div className="flex gap-1">
          {links.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                path.startsWith(l.href)
                  ? 'bg-muted text-blue'
                  : 'text-text-secondary hover:text-text-primary hover:bg-muted'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}

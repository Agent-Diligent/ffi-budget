'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const links = [
  { href: '/dashboard',    label: 'Dashboard' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/cc',           label: 'CC Tracker' },
  { href: '/import',       label: 'Import' },
  { href: '/history',      label: 'History' },
]

export default function Nav() {
  const path = usePathname()
  const router = useRouter()

  // The login page renders its own standalone layout.
  if (path.startsWith('/login')) return null

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <nav className="bg-surface border-b border-border sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
        <div>
          <span className="font-bold text-text-primary text-base">FFI Budget</span>
          <span className="text-text-muted text-xs ml-2 hidden lg:inline">Freedom Foundation Industries</span>
        </div>
        <div className="flex items-center gap-1">
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
          <button
            onClick={signOut}
            className="ml-2 px-3 py-1.5 rounded-md text-sm font-medium text-text-muted hover:text-red transition-colors"
            title="Sign out"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  )
}

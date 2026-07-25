'use client'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')

    const { error: err } = await supabase.auth.signInWithPassword({ email, password })

    if (err) {
      setError(err.message)
      setBusy(false)
      return
    }

    const next = params.get('next') || '/dashboard'
    router.replace(next)
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-sm">
        <div className="card-head">
          <div>
            <h1 className="font-bold text-text-primary">FFI Budget</h1>
            <p className="text-xs text-text-muted mt-0.5">Sign in to continue</p>
          </div>
        </div>
        <form onSubmit={submit} className="p-5 flex flex-col gap-4">
          {error && (
            <div className="text-red text-sm bg-red/10 border border-red/30 rounded px-3 py-2">
              {error}
            </div>
          )}
          <div>
            <label className="text-xs text-text-muted mb-1 block">Email</label>
            <input
              type="email" value={email} required autoFocus autoComplete="username"
              onChange={e => setEmail(e.target.value)}
              className="inp w-full" placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">Password</label>
            <input
              type="password" value={password} required autoComplete="current-password"
              onChange={e => setPassword(e.target.value)}
              className="inp w-full" placeholder="••••••••"
            />
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-text-muted text-center py-20">Loading...</div>}>
      <LoginForm />
    </Suspense>
  )
}

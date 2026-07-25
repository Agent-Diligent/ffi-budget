'use client'
import { createBrowserClient } from '@supabase/ssr'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Browser client. Stores the session in cookies so the middleware and any
// server component can see it too. This key is public by design -- the actual
// access control lives in the RLS policies, which require an authenticated role.
export const supabase = createBrowserClient(url, key)

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local')
}

// supabase-js v2 coordinates token refresh across tabs using the Web Locks API.
// In browsers that have had the app open before (especially with a service worker),
// that lock can deadlock — hanging getSession(), signInWithPassword() and every
// authed query indefinitely. A no-op lock sidesteps it; we don't need cross-tab
// refresh coordination, and it removes the hang entirely.
const noopLock = async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn()

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: globalThis.localStorage,
    lock: noopLock,
  },
})

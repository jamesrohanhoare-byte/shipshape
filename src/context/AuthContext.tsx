import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { applyBranding, cacheBranding } from '@/lib/theme'
import type { Boat, Profile } from '@/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  boat: Boat | null
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [boat, setBoat] = useState<Boat | null>(null)
  const [loading, setLoading] = useState(true)

  const loadContext = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_my_context')
    if (error || !data) {
      setProfile(null)
      setBoat(null)
      return
    }
    const ctx = data as { profile: Profile; boat: Boat }
    setProfile(ctx.profile)
    setBoat(ctx.boat)
    if (ctx.boat) {
      applyBranding({ accent: ctx.boat.accent_color, mode: ctx.boat.theme_mode })
      cacheBranding(ctx.boat.accent_color, ctx.boat.theme_mode)
    }
  }, [])

  useEffect(() => {
    let active = true

    // Hard safety net: never pulse on the splash for more than 6s, no matter what
    // stalls the session check (a blocking browser extension, a wedged request,
    // a flaky network). The app continues; auth state catches up if/when it resolves.
    const safety = setTimeout(() => { if (active) setLoading(false) }, 6000)

    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (!active) return
        setSession(data.session)
        if (data.session) await loadContext()
      } catch (err) {
        // Never trap the user on the splash screen if session restore fails
        console.warn('Session restore failed:', err)
      } finally {
        if (active) { clearTimeout(safety); setLoading(false) }
      }
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (!active) return
      setSession(sess)
      if (event === 'SIGNED_OUT') {
        setProfile(null)
        setBoat(null)
        return
      }
      // CRITICAL: never call a supabase method synchronously inside this callback.
      // It fires while the auth client holds its internal lock; an awaited query
      // (get_my_context) then waits on a lock the callback won't release until it
      // returns — a deadlock. That's exactly why a FRESH sign-in hung while a
      // reload worked (reload loads context via the boot IIFE, outside this
      // callback). setTimeout lets the callback return and free the lock first.
      // INITIAL_SESSION is handled by the boot IIFE above, so we skip it here.
      if (sess && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        setTimeout(() => { if (active) loadContext() }, 0)
      }
    })

    return () => { active = false; clearTimeout(safety); sub.subscription.unsubscribe() }
  }, [loadContext])

  const refresh = useCallback(async () => { await loadContext() }, [loadContext])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    localStorage.removeItem('boat_accent')
    localStorage.removeItem('boat_theme')
  }, [])

  return (
    <AuthContext.Provider value={{ session, profile, boat, loading, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

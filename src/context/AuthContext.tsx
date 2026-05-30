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

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session) await loadContext()
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, sess) => {
      if (!active) return
      setSession(sess)
      if (event === 'SIGNED_OUT') {
        setProfile(null)
        setBoat(null)
        return
      }
      if (sess && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')) {
        await loadContext()
      }
    })

    return () => { active = false; sub.subscription.unsubscribe() }
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

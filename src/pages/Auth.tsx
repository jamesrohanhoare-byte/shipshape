import { useState } from 'react'
import { motion } from 'framer-motion'
import { Anchor, Mail, Lock, User, Ship } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

type Mode = 'login' | 'signup'

export default function Auth() {
  const { refresh } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [boatName, setBoatName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        // AuthContext reacts to SIGNED_IN
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
        if (error) throw error
        if (!data.session) {
          throw new Error('Check your email to confirm, then sign in. (Tip: disable email confirmation in Supabase for instant access.)')
        }
        const { error: rpcErr } = await supabase.rpc('create_boat_and_profile', {
          p_boat_name: boatName.trim(),
          p_full_name: fullName.trim(),
        })
        if (rpcErr) throw rpcErr
        await refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: 'linear-gradient(165deg, var(--color-accent) 0%, color-mix(in srgb, var(--color-accent) 55%, #001016) 60%, #00121a 100%)',
      padding: 'calc(env(safe-area-inset-top) + 8px) 22px calc(env(safe-area-inset-bottom) + 24px)',
    }}>
      {/* Brand */}
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginTop: '14vh', marginBottom: 30 }}
      >
        <div style={{ width: 76, height: 76, borderRadius: 22, background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.22)' }}>
          <Anchor size={38} color="#fff" strokeWidth={2.2} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>ShipShape</div>
          <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.78)', marginTop: 2 }}>Inventory & crew ops, sorted.</div>
        </div>
      </motion.div>

      {/* Card */}
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
        style={{ background: 'var(--color-surface)', borderRadius: 24, padding: 22, boxShadow: '0 24px 60px -16px rgba(0,0,0,0.4)', maxWidth: 440, width: '100%', margin: '0 auto' }}
      >
        <div className="segmented" style={{ marginBottom: 20 }}>
          <button type="button" data-active={mode === 'login'} onClick={() => { setMode('login'); setError(null) }}>Sign in</button>
          <button type="button" data-active={mode === 'signup'} onClick={() => { setMode('signup'); setError(null) }}>Register a boat</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'signup' && (
            <>
              <Field icon={Ship} placeholder="Boat name (e.g. M/Y Serenity)" value={boatName} onChange={setBoatName} />
              <Field icon={User} placeholder="Your full name" value={fullName} onChange={setFullName} />
            </>
          )}
          <Field icon={Mail} placeholder="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
          <Field icon={Lock} placeholder="Password" type="password" value={password} onChange={setPassword} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: '11px 14px', borderRadius: 12, background: 'var(--color-danger-dim)', color: 'var(--color-danger)', fontSize: 13.5, lineHeight: 1.4 }}>
            {error}
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 18, height: 52, fontSize: 16.5 }} disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create boat & captain account'}
        </button>

        {mode === 'signup' && (
          <p style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
            You'll be the Captain. Add your crew from Settings once you're in.
          </p>
        )}
      </motion.form>
    </div>
  )
}

function Field({ icon: Icon, ...props }: {
  icon: typeof Mail
  placeholder: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoComplete?: string
}) {
  return (
    <div style={{ position: 'relative' }}>
      <Icon size={18} style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }} />
      <input
        className="input"
        style={{ paddingLeft: 44 }}
        placeholder={props.placeholder}
        type={props.type ?? 'text'}
        autoComplete={props.autoComplete}
        value={props.value}
        onChange={e => props.onChange(e.target.value)}
        required
      />
    </div>
  )
}

import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Crown, Wrench, Anchor, UserCog, Trash2 } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import Sheet from '@/components/Sheet'
import { supabase } from '@/lib/supabase'
import { createCrewMember } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { useCrew } from '@/hooks/useCrew'
import { canManageCrew, ROLE_LABELS } from '@/lib/permissions'
import { initials } from '@/lib/formatters'
import type { Role } from '@/types'

const ROLE_ICON: Record<Role, typeof Crown> = { captain: Crown, manager: UserCog, deckhand: Anchor, engineer: Wrench }
const ROLES: Role[] = ['manager', 'deckhand', 'engineer', 'captain']

export default function Crew() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const { data: crew = [], isLoading } = useCrew()
  const [adding, setAdding] = useState(false)

  if (profile && !canManageCrew(profile.role)) return <Navigate to="/" replace />

  async function changeRole(id: string, role: Role) {
    qc.setQueryData(['crew'], (prev: typeof crew) => prev?.map(c => c.id === id ? { ...c, role } : c))
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
    if (error) qc.invalidateQueries({ queryKey: ['crew'] })
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Remove ${name} from the boat? They'll lose access.`)) return
    qc.setQueryData(['crew'], (prev: typeof crew) => prev?.filter(c => c.id !== id))
    const { error } = await supabase.from('profiles').delete().eq('id', id)
    if (error) qc.invalidateQueries({ queryKey: ['crew'] })
  }

  return (
    <>
      <PageHeader
        title="Crew"
        subtitle={`${crew.length} aboard`}
        action={<button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><Plus size={17} /> Add</button>}
      />

      <div style={{ padding: '4px 16px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{[...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 14 }} />)}</div>
        ) : (
          <div className="list-group">
            {crew.map(c => {
              const Icon = ROLE_ICON[c.role]
              const isSelf = c.id === profile?.id
              return (
                <div key={c.id} className="list-row" style={{ cursor: 'default' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700, color: 'var(--color-accent)', fontSize: 15 }}>
                    {initials(c.full_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name} {isSelf && <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>(you)</span>}</div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 5 }}><Icon size={13} /> {c.email}</div>
                  </div>
                  {isSelf ? (
                    <span className="badge badge-accent">{ROLE_LABELS[c.role]}</span>
                  ) : (
                    <>
                      <select
                        value={c.role}
                        onChange={e => changeRole(c.id, e.target.value as Role)}
                        className="input input-sm"
                        style={{ width: 'auto', paddingRight: 30, fontWeight: 600 }}
                      >
                        {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                      <button onClick={() => remove(c.id, c.full_name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-faint)', padding: 6, flexShrink: 0 }}><Trash2 size={16} /></button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <p style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', padding: '14px 8px', lineHeight: 1.5 }}>
          New crew get an email + password you set here and can log in immediately. Captains control everything; managers handle stock; deckhands log usage; engineers run tasks.
        </p>
      </div>

      <AddCrewSheet open={adding} onClose={() => setAdding(false)} onAdded={() => qc.invalidateQueries({ queryKey: ['crew'] })} />
    </>
  )
}

function AddCrewSheet({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('deckhand')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    if (!fullName.trim() || !email.trim() || password.length < 6) {
      setError('Name, email, and a 6+ character password are required'); return
    }
    setBusy(true)
    try {
      await createCrewMember({ full_name: fullName.trim(), email: email.trim(), password, role })
      onAdded()
      setFullName(''); setEmail(''); setPassword(''); setRole('deckhand')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add crew member')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add crew member" maxHeight="92vh">
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label className="label">Full name</label>
          <input className="input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Sam Deckhand" autoFocus />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="crew@example.com" />
        </div>
        <div>
          <label className="label">Temporary password</label>
          <input className="input" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" />
        </div>
        <div>
          <label className="label">Role</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {ROLES.map(r => {
              const Icon = ROLE_ICON[r]
              return (
                <button key={r} onClick={() => setRole(r)} className="btn" style={{
                  height: 46, justifyContent: 'flex-start',
                  background: role === r ? 'var(--color-accent-dim)' : 'var(--color-sunken)',
                  color: role === r ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  fontWeight: 600,
                }}>
                  <Icon size={17} /> {ROLE_LABELS[r]}
                </button>
              )
            })}
          </div>
        </div>

        {error && <div style={{ padding: '11px 14px', borderRadius: 12, background: 'var(--color-danger-dim)', color: 'var(--color-danger)', fontSize: 13.5 }}>{error}</div>}

        <button className="btn btn-primary btn-block" style={{ height: 52, fontSize: 16 }} onClick={submit} disabled={busy}>
          {busy ? 'Creating…' : 'Add to crew'}
        </button>
      </div>
    </Sheet>
  )
}

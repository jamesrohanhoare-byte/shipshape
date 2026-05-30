import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Upload, Bell, BellRing, Smartphone, Share, Plus, Trash2, Check, Users, ChevronRight, LogOut, Palette } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useUnits, useCategories } from '@/hooks/useInventory'
import { canEditBoatSettings, canManageCrew } from '@/lib/permissions'
import { applyBranding, cacheBranding, type ThemeMode } from '@/lib/theme'
import { usePWAInstall } from '@/hooks/usePWAInstall'
import { requestPushPermission, pushConfigured } from '@/components/OneSignalInit'

const ACCENTS = ['#0E7490', '#0A84FF', '#0D9488', '#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#059669', '#475569', '#0F172A']

export default function Settings() {
  const { profile } = useAuth()
  const canBoat = profile ? canEditBoatSettings(profile.role) : false
  const tabs = useMemo(() => {
    const t = ['General']
    if (canBoat) t.push('Boat')
    t.push('Alerts', 'Install')
    return t
  }, [canBoat])
  const [tab, setTab] = useState(tabs[0])

  return (
    <>
      <PageHeader title="Settings" />
      <div style={{ padding: '4px 16px 10px' }}>
        <div className="segmented">
          {tabs.map(t => <button key={t} data-active={tab === t} onClick={() => setTab(t)}>{t}</button>)}
        </div>
      </div>
      <div style={{ padding: '4px 16px 16px' }}>
        {tab === 'General' && <GeneralTab />}
        {tab === 'Boat' && <BoatTab />}
        {tab === 'Alerts' && <AlertsTab />}
        {tab === 'Install' && <InstallTab />}
      </div>
    </>
  )
}

/* ── General: profile, crew link, sign out ── */
function GeneralTab() {
  const navigate = useNavigate()
  const { profile, signOut, refresh } = useAuth()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [saved, setSaved] = useState(false)

  async function saveName() {
    if (!profile || name.trim() === profile.full_name) return
    await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', profile.id)
    await refresh()
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label className="label">Your name</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" value={name} onChange={e => setName(e.target.value)} onBlur={saveName} />
          {saved && <div style={{ display: 'flex', alignItems: 'center', color: 'var(--color-success)' }}><Check size={20} /></div>}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginTop: 6 }}>{profile?.email}</div>
      </div>

      {profile && canManageCrew(profile.role) && (
        <button className="list-group" onClick={() => navigate('/crew')} style={{ width: '100%' }}>
          <div className="list-row">
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Users size={18} style={{ color: 'var(--color-accent)' }} /></div>
            <div style={{ flex: 1, fontWeight: 600 }}>Manage crew</div>
            <ChevronRight size={18} style={{ color: 'var(--color-text-faint)' }} />
          </div>
        </button>
      )}

      <button className="btn btn-danger btn-block" onClick={signOut}><LogOut size={17} /> Sign out</button>
    </div>
  )
}

/* ── Boat: branding (logo, accent, theme) + units + categories ── */
function BoatTab() {
  const { boat, refresh } = useAuth()
  const qc = useQueryClient()
  const [name, setName] = useState(boat?.name ?? '')
  const [accent, setAccent] = useState(boat?.accent_color ?? '#0E7490')
  const [mode, setMode] = useState<ThemeMode>((boat?.theme_mode as ThemeMode) ?? 'light')
  const [uploading, setUploading] = useState(false)

  async function patchBoat(patch: Record<string, unknown>) {
    if (!boat) return
    await supabase.from('boats').update(patch).eq('id', boat.id)
    await refresh()
  }

  async function onAccent(hex: string) {
    setAccent(hex)
    applyBranding({ accent: hex, mode })
    cacheBranding(hex, mode)
    await patchBoat({ accent_color: hex })
  }
  async function onMode(m: ThemeMode) {
    setMode(m)
    applyBranding({ accent, mode: m })
    cacheBranding(accent, m)
    await patchBoat({ theme_mode: m })
  }

  async function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !boat) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'png'
      const path = `${boat.id}/logo-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('boat-logos').upload(path, file, { upsert: true })
      if (error) throw error
      const { data } = supabase.storage.from('boat-logos').getPublicUrl(path)
      await patchBoat({ logo_url: data.publicUrl })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Logo + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <label style={{ cursor: 'pointer', flexShrink: 0 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, position: 'relative',
            background: boat?.logo_url ? `center/cover no-repeat url(${boat.logo_url})` : 'var(--color-accent-dim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-border)',
          }}>
            {!boat?.logo_url && <Upload size={22} style={{ color: 'var(--color-accent)' }} />}
            {uploading && <div style={{ position: 'absolute', inset: 0, borderRadius: 16, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12 }}>…</div>}
          </div>
          <input type="file" accept="image/*" onChange={onLogo} style={{ display: 'none' }} />
        </label>
        <div style={{ flex: 1 }}>
          <label className="label">Boat name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} onBlur={() => name.trim() && name !== boat?.name && patchBoat({ name: name.trim() })} />
        </div>
      </div>

      {/* Accent */}
      <div>
        <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Palette size={14} /> Brand colour</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {ACCENTS.map(c => (
            <button key={c} onClick={() => onAccent(c)} style={{
              width: 38, height: 38, borderRadius: 11, background: c, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: accent.toLowerCase() === c.toLowerCase() ? `0 0 0 3px var(--color-base), 0 0 0 5px ${c}` : 'none',
            }}>
              {accent.toLowerCase() === c.toLowerCase() && <Check size={18} color="#fff" />}
            </button>
          ))}
          <label style={{ width: 38, height: 38, borderRadius: 11, border: '1px dashed var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
            <Plus size={16} style={{ color: 'var(--color-text-tertiary)' }} />
            <input type="color" value={accent} onChange={e => onAccent(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
          </label>
        </div>
      </div>

      {/* Theme */}
      <div>
        <label className="label">Appearance</label>
        <div className="segmented">
          {(['light', 'dark', 'auto'] as ThemeMode[]).map(m => <button key={m} data-active={mode === m} onClick={() => onMode(m)} style={{ textTransform: 'capitalize' }}>{m}</button>)}
        </div>
      </div>

      <EditableList title="Units of measure" queryKey="units" table="units" extraField="abbreviation" extraPlaceholder="abbr" placeholder="Unit name" onChange={() => qc.invalidateQueries({ queryKey: ['units'] })} />
      <EditableList title="Categories" queryKey="categories" table="categories" placeholder="Category name" onChange={() => qc.invalidateQueries({ queryKey: ['categories'] })} />
    </div>
  )
}

function EditableList({ title, table, placeholder, extraField, extraPlaceholder }: {
  title: string; queryKey: string; table: 'units' | 'categories'; placeholder: string; extraField?: string; extraPlaceholder?: string; onChange: () => void
}) {
  const { boat } = useAuth()
  const qc = useQueryClient()
  const unitsQ = useUnits()
  const catsQ = useCategories()
  const list = table === 'units' ? unitsQ.data ?? [] : catsQ.data ?? []
  const [name, setName] = useState('')
  const [extra, setExtra] = useState('')

  async function add() {
    if (!name.trim() || !boat) return
    const payload: Record<string, unknown> = { boat_id: boat.id, name: name.trim() }
    if (extraField) payload[extraField] = extra.trim()
    await supabase.from(table).insert(payload)
    setName(''); setExtra('')
    qc.invalidateQueries({ queryKey: [table] })
  }
  async function del(id: string) {
    await supabase.from(table).delete().eq('id', id)
    qc.invalidateQueries({ queryKey: [table] })
  }

  return (
    <div>
      <label className="label">{title}</label>
      <div className="list-group" style={{ marginBottom: 8 }}>
        {list.map((x: { id: string; name: string; abbreviation?: string }) => (
          <div key={x.id} className="list-row" style={{ cursor: 'default', padding: '11px 14px' }}>
            <span style={{ flex: 1, fontWeight: 500 }}>{x.name}{x.abbreviation ? <span style={{ color: 'var(--color-text-tertiary)' }}> · {x.abbreviation}</span> : ''}</span>
            <button onClick={() => del(x.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-faint)', padding: 4 }}><Trash2 size={15} /></button>
          </div>
        ))}
        {list.length === 0 && <div className="list-row" style={{ cursor: 'default', color: 'var(--color-text-tertiary)', fontSize: 14 }}>None yet</div>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="input input-sm" value={name} onChange={e => setName(e.target.value)} placeholder={placeholder} style={{ flex: 1 }} />
        {extraField && <input className="input input-sm" value={extra} onChange={e => setExtra(e.target.value)} placeholder={extraPlaceholder} style={{ width: 80 }} />}
        <button className="btn btn-secondary btn-sm" onClick={add} style={{ flexShrink: 0 }}><Plus size={16} /></button>
      </div>
    </div>
  )
}

/* ── Alerts: push permission ── */
function AlertsTab() {
  const { profile } = useAuth()
  const configured = pushConfigured()
  const [granted, setGranted] = useState<boolean | null>(null)
  const wantsAlerts = profile && (profile.role === 'captain' || profile.role === 'manager')

  async function enable() {
    const ok = await requestPushPermission()
    setGranted(ok)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {granted ? <BellRing size={22} style={{ color: 'var(--color-accent)' }} /> : <Bell size={22} style={{ color: 'var(--color-accent)' }} />}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Low-stock alerts</div>
          <div style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', marginTop: 3, lineHeight: 1.5 }}>
            {wantsAlerts
              ? 'Get a push when an item drops to its par level, so you know what to buy.'
              : 'Low-stock alerts go to the captain and manager. You can still enable general notifications.'}
          </div>
        </div>
      </div>

      {!configured && (
        <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--color-warning-dim)', color: 'var(--color-warning)', fontSize: 13 }}>
          Push isn’t configured yet (no OneSignal app ID). Add VITE_ONESIGNAL_APP_ID to enable.
        </div>
      )}

      <button className="btn btn-primary btn-block" onClick={enable} disabled={!configured}>
        {granted ? 'Notifications enabled ✓' : 'Enable notifications'}
      </button>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', lineHeight: 1.5, textAlign: 'center' }}>
        On iPhone, add ShipShape to your Home Screen first (see the Install tab), then enable.
      </p>
    </div>
  )
}

/* ── Install: device-aware ── */
function InstallTab() {
  const { state, platform, install } = usePWAInstall()
  const [installed, setInstalled] = useState(state === 'standalone')
  useEffect(() => { setInstalled(state === 'standalone') }, [state])

  if (installed) {
    return (
      <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--color-success-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={22} style={{ color: 'var(--color-success)' }} /></div>
        <div><div style={{ fontWeight: 700 }}>Installed</div><div style={{ fontSize: 13.5, color: 'var(--color-text-secondary)' }}>You’re running the home-screen app.</div></div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Smartphone size={22} style={{ color: 'var(--color-accent)' }} /></div>
        <div><div style={{ fontWeight: 700 }}>Install ShipShape</div><div style={{ fontSize: 13.5, color: 'var(--color-text-secondary)' }}>Full screen, fast, and required for push on iPhone.</div></div>
      </div>

      {state === 'android' || platform === 'android' || platform === 'other' ? (
        <button className="btn btn-primary btn-block" onClick={install}>Add to Home Screen</button>
      ) : (
        <div className="list-group">
          <div className="list-row" style={{ cursor: 'default' }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--color-info-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--color-info)' }}>1</div>
            <span style={{ flex: 1 }}>Tap the Share button</span> <Share size={18} style={{ color: 'var(--color-info)' }} />
          </div>
          <div className="list-row" style={{ cursor: 'default' }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--color-success-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--color-success)' }}>2</div>
            <span style={{ flex: 1 }}>Tap “Add to Home Screen”</span> <Plus size={18} style={{ color: 'var(--color-success)' }} />
          </div>
        </div>
      )}
    </div>
  )
}

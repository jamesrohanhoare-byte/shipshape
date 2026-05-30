import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Upload, Bell, BellRing, BellOff, Smartphone, Share, Plus, Trash2, Check,
  Users, ChevronRight, LogOut, Palette, X, Compass,
} from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useUnits, useCategories } from '@/hooks/useInventory'
import { canEditBoatSettings, canManageCrew } from '@/lib/permissions'
import { applyBranding, cacheBranding, type ThemeMode } from '@/lib/theme'
import { usePWAInstall } from '@/hooks/usePWAInstall'
import { requestPushPermission, pushConfigured } from '@/components/OneSignalInit'
import SettingsDataTab from '@/components/SettingsDataTab'
import { APP_VERSION } from '@/lib/version'
import type { NotifyMode } from '@/types'

const ACCENTS = ['#0E7490', '#0A84FF', '#0D9488', '#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#059669', '#475569', '#0F172A']

export default function Settings() {
  const { profile } = useAuth()
  const canBoat = profile ? canEditBoatSettings(profile.role) : false
  const tabs = useMemo(() => {
    const t = ['General']
    if (canBoat) t.push('Boat', 'Data')
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
        {tab === 'Data' && <SettingsDataTab />}
        {tab === 'Alerts' && <AlertsTab />}
        {tab === 'Install' && <InstallTab />}
      </div>
      <div style={{ textAlign: 'center', padding: '8px 0 4px', fontSize: 12.5, color: 'var(--color-text-faint)', fontWeight: 600 }}>
        ShipShape v{APP_VERSION}
      </div>
    </>
  )
}

function ErrorBanner({ msg, onClose }: { msg: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderRadius: 12, background: 'var(--color-danger-dim)', color: 'var(--color-danger)', fontSize: 13.5 }}>
      <span style={{ flex: 1 }}>{msg}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2 }}><X size={16} /></button>
    </div>
  )
}

/* ── General ── */
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

  async function replayTour() {
    if (!profile) return
    await supabase.from('profiles').update({ onboarded: false }).eq('id', profile.id)
    await refresh()
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

      <div className="list-group" style={{ width: '100%' }}>
        {profile && canManageCrew(profile.role) && (
          <button className="list-row" onClick={() => navigate('/crew')}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Users size={18} style={{ color: 'var(--color-accent)' }} /></div>
            <div style={{ flex: 1, fontWeight: 600 }}>Manage crew</div>
            <ChevronRight size={18} style={{ color: 'var(--color-text-faint)' }} />
          </button>
        )}
        <button className="list-row" onClick={replayTour}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Compass size={18} style={{ color: 'var(--color-accent)' }} /></div>
          <div style={{ flex: 1, fontWeight: 600 }}>Replay walkthrough</div>
          <ChevronRight size={18} style={{ color: 'var(--color-text-faint)' }} />
        </button>
      </div>

      <button className="btn btn-danger btn-block" onClick={signOut}><LogOut size={17} /> Sign out</button>
    </div>
  )
}

/* ── Boat: branding + managed lists ── */
function BoatTab() {
  const { boat, refresh } = useAuth()
  const [name, setName] = useState(boat?.name ?? '')
  const [accent, setAccent] = useState(boat?.accent_color ?? '#0E7490')
  const [mode, setMode] = useState<ThemeMode>((boat?.theme_mode as ThemeMode) ?? 'light')
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function patchBoat(patch: Record<string, unknown>) {
    if (!boat) return
    const { error } = await supabase.from('boats').update(patch).eq('id', boat.id)
    if (error) { setErr(error.message); return }
    await refresh()
  }

  async function onAccent(hex: string) {
    setAccent(hex); applyBranding({ accent: hex, mode }); cacheBranding(hex, mode)
    await patchBoat({ accent_color: hex })
  }
  async function onMode(m: ThemeMode) {
    setMode(m); applyBranding({ accent, mode: m }); cacheBranding(accent, m)
    await patchBoat({ theme_mode: m })
  }

  async function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !boat) return
    if (file.size > 5 * 1024 * 1024) { setErr('Image too large (max 5MB)'); return }
    setUploading(true); setErr(null)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `${boat.id}/logo-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('boat-logos').upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('boat-logos').getPublicUrl(path)
      await patchBoat({ logo_url: data.publicUrl })
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {err && <ErrorBanner msg={err} onClose={() => setErr(null)} />}

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
      <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', marginTop: -12 }}>Tap the square to upload your logo (PNG/JPG, max 5MB). It shows in the app and on reports.</div>

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

      <ManagedList kind="units" hasAbbr title="Units of measure" placeholder="e.g. Bottle" abbrPlaceholder="btl" />
      <ManagedList kind="categories" title="Categories" placeholder="e.g. Beverages" />
    </div>
  )
}

/* Robust add / inline-edit / delete list for units & categories */
function ManagedList({ kind, hasAbbr, title, placeholder, abbrPlaceholder }: {
  kind: 'units' | 'categories'; hasAbbr?: boolean; title: string; placeholder: string; abbrPlaceholder?: string
}) {
  const { boat } = useAuth()
  const qc = useQueryClient()
  const unitsQ = useUnits()
  const catsQ = useCategories()
  const list = (kind === 'units' ? unitsQ.data : catsQ.data) ?? []
  const [newName, setNewName] = useState('')
  const [newAbbr, setNewAbbr] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: [kind] })

  async function add() {
    if (!newName.trim() || !boat) return
    setBusy(true); setErr(null)
    const payload: Record<string, unknown> = { boat_id: boat.id, name: newName.trim() }
    if (hasAbbr) payload.abbreviation = newAbbr.trim()
    const { error } = await supabase.from(kind).insert(payload)
    setBusy(false)
    if (error) { setErr(error.message); return }
    setNewName(''); setNewAbbr(''); invalidate()
  }

  async function rename(id: string, patch: Record<string, unknown>) {
    const { error } = await supabase.from(kind).update(patch).eq('id', id)
    if (error) { setErr(error.message); return }
    invalidate()
  }

  async function del(id: string) {
    const { error } = await supabase.from(kind).delete().eq('id', id)
    if (error) { setErr(error.message); return }
    invalidate()
  }

  return (
    <div>
      <label className="label">{title}</label>
      {err && <div style={{ marginBottom: 8 }}><ErrorBanner msg={err} onClose={() => setErr(null)} /></div>}
      <div className="list-group" style={{ marginBottom: 8 }}>
        {list.map((x: { id: string; name: string; abbreviation?: string }) => (
          <div key={x.id} className="list-row" style={{ cursor: 'default', gap: 8, padding: '8px 12px' }}>
            <input
              defaultValue={x.name}
              onBlur={e => e.target.value.trim() && e.target.value !== x.name && rename(x.id, { name: e.target.value.trim() })}
              className="input input-sm"
              style={{ flex: 1, border: 'none', background: 'transparent', paddingLeft: 4, fontWeight: 500 }}
            />
            {hasAbbr && (
              <input
                defaultValue={x.abbreviation ?? ''}
                onBlur={e => e.target.value !== (x.abbreviation ?? '') && rename(x.id, { abbreviation: e.target.value.trim() })}
                className="input input-sm"
                placeholder="abbr"
                style={{ width: 64, border: 'none', background: 'var(--color-sunken)', color: 'var(--color-text-secondary)', textAlign: 'center' }}
              />
            )}
            <button onClick={() => del(x.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-faint)', padding: 4, flexShrink: 0 }}><Trash2 size={15} /></button>
          </div>
        ))}
        {list.length === 0 && <div className="list-row" style={{ cursor: 'default', color: 'var(--color-text-tertiary)', fontSize: 14 }}>None yet — add one below</div>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="input input-sm" value={newName} onChange={e => setNewName(e.target.value)} placeholder={placeholder} style={{ flex: 1 }} onKeyDown={e => e.key === 'Enter' && add()} />
        {hasAbbr && <input className="input input-sm" value={newAbbr} onChange={e => setNewAbbr(e.target.value)} placeholder={abbrPlaceholder} style={{ width: 70 }} onKeyDown={e => e.key === 'Enter' && add()} />}
        <button className="btn btn-primary btn-sm" onClick={add} disabled={busy || !newName.trim()} style={{ flexShrink: 0 }}><Plus size={16} /></button>
      </div>
    </div>
  )
}

/* ── Alerts: push permission + notification volume ── */
function AlertsTab() {
  const { profile, boat, refresh } = useAuth()
  const configured = pushConfigured()
  const [granted, setGranted] = useState<boolean | null>(null)
  const [notifyMode, setNotifyMode] = useState<NotifyMode>((boat?.notify_mode as NotifyMode) ?? 'all')
  const canConfig = profile && (profile.role === 'captain' || profile.role === 'manager')

  async function enable() {
    const ok = await requestPushPermission()
    setGranted(ok)
  }

  async function setMode(m: NotifyMode) {
    setNotifyMode(m)
    if (!boat) return
    await supabase.from('boats').update({ notify_mode: m }).eq('id', boat.id)
    await refresh()
  }

  const Icon = notifyMode === 'off' ? BellOff : granted ? BellRing : Bell

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={22} style={{ color: 'var(--color-accent)' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Stock notifications</div>
          <div style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', marginTop: 3, lineHeight: 1.5 }}>
            Alerts go to the captain &amp; manager so they know what's been used and what to buy.
          </div>
        </div>
      </div>

      {canConfig && (
        <div>
          <label className="label">How often to notify</label>
          <div className="segmented">
            <button data-active={notifyMode === 'all'} onClick={() => setMode('all')}>Every use</button>
            <button data-active={notifyMode === 'low'} onClick={() => setMode('low')}>Only low</button>
            <button data-active={notifyMode === 'off'} onClick={() => setMode('off')}>Off</button>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', marginTop: 8, lineHeight: 1.5 }}>
            {notifyMode === 'all' && 'A push every time stock is used. Most visibility — can be a lot on a busy boat.'}
            {notifyMode === 'low' && 'A push only when an item hits its par level or runs out. Quieter — just what matters.'}
            {notifyMode === 'off' && 'No stock pushes. Items still go on the shopping list automatically.'}
          </div>
        </div>
      )}

      {!configured ? (
        <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--color-warning-dim)', color: 'var(--color-warning)', fontSize: 13 }}>
          Push isn't configured (no OneSignal app ID).
        </div>
      ) : (
        <button className="btn btn-primary btn-block" onClick={enable}>
          {granted ? 'Notifications enabled ✓' : 'Enable notifications on this device'}
        </button>
      )}
      <p style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', lineHeight: 1.5, textAlign: 'center' }}>
        On iPhone, add ShipShape to your Home Screen first (Install tab), then enable.
      </p>
    </div>
  )
}

/* ── Install ── */
function InstallTab() {
  const { state, platform, install } = usePWAInstall()
  const [installed, setInstalled] = useState(state === 'standalone')
  useEffect(() => { setInstalled(state === 'standalone') }, [state])

  if (installed) {
    return (
      <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--color-success-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={22} style={{ color: 'var(--color-success)' }} /></div>
        <div><div style={{ fontWeight: 700 }}>Installed</div><div style={{ fontSize: 13.5, color: 'var(--color-text-secondary)' }}>You're running the home-screen app.</div></div>
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
            <span style={{ flex: 1 }}>Tap "Add to Home Screen"</span> <Plus size={18} style={{ color: 'var(--color-success)' }} />
          </div>
        </div>
      )}
    </div>
  )
}

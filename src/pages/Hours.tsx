import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Briefcase, Moon, Trash2, ShieldCheck, ShieldAlert, Clock } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import Sheet from '@/components/Sheet'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useCrew } from '@/hooks/useCrew'
import { ROLE_LABELS } from '@/lib/permissions'
import { formatDate } from '@/lib/formatters'
import { summarise, hoursBetweenISO } from '@/lib/restHours'
import type { TimeLog, TimeKind } from '@/types'

const INTERVALS: { v: Interval; label: string; days: number }[] = [
  { v: 'today', label: 'Today', days: 1 },
  { v: '7d', label: 'Week', days: 7 },
  { v: '30d', label: 'Month', days: 30 },
]
type Interval = 'today' | '7d' | '30d'

export default function Hours() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const { data: crew = [] } = useCrew()
  const canSeeCrew = !!profile && (profile.role === 'captain' || profile.role === 'manager')

  const [interval, setInterval] = useState<Interval>('7d')
  const [view, setView] = useState<'mine' | 'crew'>('mine')
  const [adding, setAdding] = useState<TimeKind | null>(null)

  const days = INTERVALS.find(i => i.v === interval)!.days
  const fromISO = useMemo(() => {
    const d = new Date()
    if (days === 1) d.setHours(0, 0, 0, 0); else d.setDate(d.getDate() - days)
    return d.toISOString()
  }, [days])

  const { data: logs = [], isLoading } = useQuery<TimeLog[]>({
    queryKey: ['time_logs', fromISO],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_logs').select('*').gte('started_at', fromISO).order('started_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const myLogs = useMemo(() => logs.filter(l => l.user_id === profile?.id), [logs, profile?.id])
  const mySummary = useMemo(() => summarise(myLogs, days), [myLogs, days])

  const crewRows = useMemo(() => {
    const byUser = new Map<string, TimeLog[]>()
    for (const l of logs) { if (!byUser.has(l.user_id)) byUser.set(l.user_id, []); byUser.get(l.user_id)!.push(l) }
    return [...byUser.entries()]
      .map(([uid, ls]) => {
        const member = crew.find(c => c.id === uid)
        return { uid, name: member?.full_name ?? 'Crew', role: member?.role, summary: summarise(ls, days) }
      })
      .sort((a, b) => b.summary.workHours - a.summary.workHours)
  }, [logs, crew, days])

  async function remove(id: string) {
    qc.setQueryData<TimeLog[]>(['time_logs', fromISO], prev => prev?.filter(l => l.id !== id))
    const { error } = await supabase.from('time_logs').delete().eq('id', id)
    if (error) qc.invalidateQueries({ queryKey: ['time_logs'] })
  }

  return (
    <>
      <PageHeader title="Hours" subtitle="Work & rest" />

      <div style={{ padding: '4px 16px 8px' }}>
        <div className="segmented">
          {INTERVALS.map(i => <button key={i.v} data-active={interval === i.v} onClick={() => setInterval(i.v)}>{i.label}</button>)}
        </div>
        {canSeeCrew && (
          <div className="segmented" style={{ marginTop: 8 }}>
            <button data-active={view === 'mine'} onClick={() => setView('mine')}>Mine</button>
            <button data-active={view === 'crew'} onClick={() => setView('crew')}>Crew</button>
          </div>
        )}
      </div>

      {view === 'mine' ? (
        <div style={{ padding: '4px 16px 16px' }}>
          {/* Log buttons */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setAdding('work')}><Briefcase size={17} /> Log work</button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setAdding('sleep')}><Moon size={17} /> Log sleep</button>
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <StatCard icon={Briefcase} value={mySummary.workHours} label="worked" />
            <StatCard icon={Moon} value={mySummary.sleepHours} label="slept" />
          </div>
          {mySummary.breaches.length > 0 && <BreachBanner breaches={mySummary.breaches} />}

          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>{[...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 14 }} />)}</div>
          ) : myLogs.length === 0 ? (
            <EmptyState icon={Clock} title="Nothing logged" message="Log your work shifts and sleep to track rest hours." />
          ) : (
            <div className="list-group" style={{ marginTop: 4 }}>
              {myLogs.map(l => <LogRow key={l.id} log={l} onRemove={() => remove(l.id)} />)}
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: '4px 16px 16px' }}>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{[...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 14 }} />)}</div>
          ) : crewRows.length === 0 ? (
            <EmptyState icon={Clock} title="No hours yet" message="Crew time will appear here once people start logging." />
          ) : (
            <>
              <div className="section-header" style={{ paddingLeft: 4 }}>Crew · {INTERVALS.find(i => i.v === interval)!.label.toLowerCase()}</div>
              <div className="list-group">
                {crewRows.map(r => (
                  <div key={r.uid} className="list-row" style={{ cursor: 'default', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{r.name}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', marginTop: 1 }}>
                        {r.role ? ROLE_LABELS[r.role] : ''} · {r.summary.workHours}h work · {r.summary.sleepHours}h sleep
                      </div>
                    </div>
                    {r.summary.compliant ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--color-success)', flexShrink: 0 }}>
                        <ShieldCheck size={15} /> OK
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--color-warning)', flexShrink: 0 }}>
                        <ShieldAlert size={15} /> {r.summary.breaches.length}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: '14px 20px', lineHeight: 1.5 }}>
                MLC rest-hour guide: ≤14h work in any day, ≤91h in 7 days. ⚠ flags a breach.
              </p>
            </>
          )}
        </div>
      )}

      <LogSheet open={!!adding} kind={adding ?? 'work'} onClose={() => setAdding(null)} onSaved={() => qc.invalidateQueries({ queryKey: ['time_logs'] })} />
    </>
  )
}

function StatCard({ icon: Icon, value, label }: { icon: typeof Briefcase; value: number; label: string }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={19} style={{ color: 'var(--color-accent)' }} />
      </div>
      <div>
        <div className="tabnum" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}<span style={{ fontSize: 13, color: 'var(--color-text-tertiary)', fontWeight: 600 }}> h</span></div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 3 }}>{label}</div>
      </div>
    </div>
  )
}

function BreachBanner({ breaches }: { breaches: string[] }) {
  return (
    <div style={{ padding: '11px 14px', borderRadius: 12, background: 'var(--color-warning-dim)', color: 'var(--color-warning)', fontSize: 13, marginBottom: 12, display: 'flex', gap: 8 }}>
      <ShieldAlert size={17} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <div style={{ fontWeight: 700 }}>Rest-hour breach</div>
        {breaches.map((b, i) => <div key={i} style={{ marginTop: 2 }}>{b}</div>)}
      </div>
    </div>
  )
}

function LogRow({ log, onRemove }: { log: TimeLog; onRemove: () => void }) {
  const Icon = log.kind === 'work' ? Briefcase : Moon
  const s = new Date(log.started_at), e = new Date(log.ended_at)
  const t = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return (
    <div className="list-row" style={{ cursor: 'default' }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={17} style={{ color: 'var(--color-accent)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{log.kind} · {formatDate(log.started_at, 'EEE d MMM')}</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>{t(s)} – {t(e)}{log.note ? ` · ${log.note}` : ''}</div>
      </div>
      <div className="tabnum" style={{ fontWeight: 700 }}>{Number(log.hours).toFixed(1)}h</div>
      <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-faint)', padding: 6, flexShrink: 0 }}><Trash2 size={15} /></button>
    </div>
  )
}

function LogSheet({ open, kind, onClose, onSaved }: { open: boolean; kind: TimeKind; onClose: () => void; onSaved: () => void }) {
  const { boat } = useAuth()
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Build ISO timestamps; roll end to next day if it's not after start (overnight).
  const startISO = date && start ? new Date(`${date}T${start}`).toISOString() : ''
  const endISO = (() => {
    if (!date || !end || !start) return ''
    let e = new Date(`${date}T${end}`)
    const s = new Date(`${date}T${start}`)
    if (e <= s) e = new Date(e.getTime() + 24 * 3600 * 1000)
    return e.toISOString()
  })()
  const computed = startISO && endISO ? hoursBetweenISO(startISO, endISO) : 0

  async function save() {
    if (!boat || !startISO || !endISO || computed <= 0) { setError('Enter a start and end time'); return }
    setBusy(true); setError(null)
    const { error } = await supabase.from('time_logs').insert({
      boat_id: boat.id, kind, started_at: startISO, ended_at: endISO, hours: computed, note: note.trim() || null,
    })
    setBusy(false)
    if (error) { setError(error.message); return }
    onSaved(); setStart(''); setEnd(''); setNote(''); onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={kind === 'work' ? 'Log work' : 'Log sleep'} maxHeight="auto">
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label className="label">Date</label>
          <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="label">{kind === 'work' ? 'Started' : 'Asleep'}</label>
            <input className="input" type="time" value={start} onChange={e => setStart(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">{kind === 'work' ? 'Ended' : 'Awake'}</label>
            <input className="input" type="time" value={end} onChange={e => setEnd(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Note (optional)</label>
          <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder={kind === 'work' ? 'Night watch, deck…' : 'Broken sleep…'} />
        </div>

        <div style={{ textAlign: 'center', opacity: computed > 0 ? 1 : 0.4 }}>
          <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>That's </span>
          <span className="tabnum" style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-accent)' }}>{computed.toFixed(1)} hours</span>
        </div>

        {error && <div style={{ padding: '11px 14px', borderRadius: 12, background: 'var(--color-danger-dim)', color: 'var(--color-danger)', fontSize: 13.5 }}>{error}</div>}

        <button className="btn btn-primary btn-block" style={{ height: 52, fontSize: 16 }} onClick={save} disabled={busy || computed <= 0}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Sheet>
  )
}

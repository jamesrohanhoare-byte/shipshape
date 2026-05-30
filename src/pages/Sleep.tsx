import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Moon, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import Sheet from '@/components/Sheet'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { formatDate } from '@/lib/formatters'
import type { SleepLog } from '@/types'

function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60 // crossed midnight
  return Math.round((mins / 60) * 10) / 10
}

export default function Sleep() {
  const { boat } = useAuth()
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)

  const { data: logs = [], isLoading } = useQuery<SleepLog[]>({
    queryKey: ['sleep'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sleep_logs').select('*').order('log_date', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const weekTotal = useMemo(() => {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
    return logs.filter(l => new Date(l.log_date) >= weekAgo).reduce((s, l) => s + Number(l.hours), 0)
  }, [logs])
  const weekAvg = useMemo(() => {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
    const recent = logs.filter(l => new Date(l.log_date) >= weekAgo)
    return recent.length ? Math.round((weekTotal / recent.length) * 10) / 10 : 0
  }, [logs, weekTotal])

  async function remove(id: string) {
    qc.setQueryData<SleepLog[]>(['sleep'], prev => prev?.filter(l => l.id !== id))
    await supabase.from('sleep_logs').delete().eq('id', id)
  }

  return (
    <>
      <PageHeader
        title="Sleep"
        subtitle="Your rest log"
        action={<button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><Plus size={17} /> Log</button>}
      />

      <div style={{ padding: '4px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div className="tabnum" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em' }}>{weekTotal.toFixed(1)}<span style={{ fontSize: 14, color: 'var(--color-text-tertiary)', fontWeight: 600 }}> h</span></div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Last 7 days</div>
          </div>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div className="tabnum" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em' }}>{weekAvg.toFixed(1)}<span style={{ fontSize: 14, color: 'var(--color-text-tertiary)', fontWeight: 600 }}> h</span></div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Nightly average</div>
          </div>
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{[...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 14 }} />)}</div>
        ) : logs.length === 0 ? (
          <EmptyState icon={Moon} title="No sleep logged" message="Log your hours to keep an eye on crew fatigue. Manual entry — add a wearable sync later." action={<button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={18} /> Log sleep</button>} />
        ) : (
          <div className="list-group">
            {logs.map(l => (
              <div key={l.id} className="list-row" style={{ cursor: 'default' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Moon size={18} style={{ color: 'var(--color-accent)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{formatDate(l.log_date, 'EEE d MMM')}</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                    {l.sleep_start && l.sleep_end ? `${l.sleep_start.slice(0, 5)} – ${l.sleep_end.slice(0, 5)}` : 'Logged'}{l.note ? ` · ${l.note}` : ''}
                  </div>
                </div>
                <div className="tabnum" style={{ fontWeight: 700 }}>{Number(l.hours).toFixed(1)}h</div>
                <button onClick={() => remove(l.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-faint)', padding: 6, flexShrink: 0 }}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <SleepSheet open={adding} onClose={() => setAdding(false)} boatId={boat?.id} hoursBetween={hoursBetween} />
    </>
  )
}

function SleepSheet({ open, onClose, boatId, hoursBetween }: { open: boolean; onClose: () => void; boatId?: string; hoursBetween: (s: string, e: string) => number }) {
  const qc = useQueryClient()
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [manualHours, setManualHours] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const computed = start && end ? hoursBetween(start, end) : Number(manualHours) || 0

  async function save() {
    if (!boatId || computed <= 0) return
    setBusy(true)
    const { error } = await supabase.from('sleep_logs').insert({
      boat_id: boatId,
      log_date: date,
      sleep_start: start || null,
      sleep_end: end || null,
      hours: computed,
      note: note.trim() || null,
    })
    setBusy(false)
    if (!error) {
      qc.invalidateQueries({ queryKey: ['sleep'] })
      setStart(''); setEnd(''); setManualHours(''); setNote('')
      onClose()
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Log sleep" maxHeight="auto">
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label className="label">Date</label>
          <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="label">Asleep</label>
            <input className="input" type="time" value={start} onChange={e => setStart(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">Awake</label>
            <input className="input" type="time" value={end} onChange={e => setEnd(e.target.value)} />
          </div>
        </div>
        {!(start && end) && (
          <div>
            <label className="label">Or just total hours</label>
            <input className="input tabnum" type="number" inputMode="decimal" value={manualHours} onChange={e => setManualHours(e.target.value)} placeholder="e.g. 6.5" />
          </div>
        )}
        <div>
          <label className="label">Note (optional)</label>
          <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Broken sleep, night watch…" />
        </div>

        <motion.div animate={{ opacity: computed > 0 ? 1 : 0.4 }} style={{ textAlign: 'center', padding: '4px 0' }}>
          <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>That's </span>
          <span className="tabnum" style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-accent)' }}>{computed.toFixed(1)} hours</span>
        </motion.div>

        <button className="btn btn-primary btn-block" style={{ height: 52, fontSize: 16 }} onClick={save} disabled={busy || computed <= 0}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Sheet>
  )
}

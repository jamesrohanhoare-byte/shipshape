import { useEffect, useState } from 'react'
import { Trash2, Sun, Moon, Repeat2 } from 'lucide-react'
import Sheet from './Sheet'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useCrew } from '@/hooks/useCrew'
import { useQueryClient } from '@tanstack/react-query'
import { ROLE_LABELS } from '@/lib/permissions'
import { notifyTaskAssigned } from '@/lib/api'
import { toDateStr, today } from '@/lib/taskScheduling'
import type { Task, TaskStatus, TaskShift, RecurrenceType } from '@/types'

const STATUSES: { v: TaskStatus; label: string }[] = [
  { v: 'open', label: 'To do' },
  { v: 'in_progress', label: 'Doing' },
  { v: 'done', label: 'Done' },
]
const RECURRENCES: { v: RecurrenceType; label: string }[] = [
  { v: 'daily', label: 'Daily' },
  { v: 'weekly', label: 'Weekly' },
  { v: 'monthly', label: 'Monthly' },
]

export default function TaskSheet({
  open, onClose, task, defaultDate,
}: { open: boolean; onClose: () => void; task?: Task | null; defaultDate?: string }) {
  const { boat } = useAuth()
  const { data: crew = [] } = useCrew()
  const qc = useQueryClient()
  const editing = !!task

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [status, setStatus] = useState<TaskStatus>('open')
  const [dueDate, setDueDate] = useState('')
  const [shift, setShift] = useState<TaskShift>('day')
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('weekly')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (task) {
      setTitle(task.title); setDescription(task.description ?? '')
      setAssignedTo(task.assigned_to ?? ''); setStatus(task.status)
      setDueDate(task.due_date ?? ''); setShift(task.shift ?? 'day')
      setIsRecurring(task.is_recurring ?? false)
      setRecurrenceType(task.recurrence_type ?? 'weekly')
    } else {
      setTitle(''); setDescription(''); setAssignedTo(''); setStatus('open')
      setDueDate(defaultDate ?? toDateStr(today()))
      setShift('day'); setIsRecurring(false); setRecurrenceType('weekly')
    }
  }, [open, task, defaultDate])

  async function save() {
    if (!title.trim()) { setError('Give the task a title'); return }
    setBusy(true); setError(null)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        assigned_to: assignedTo || null,
        status,
        due_date: dueDate || null,
        shift,
        is_recurring: isRecurring,
        recurrence_type: isRecurring ? recurrenceType : null,
        recurrence_start_date: isRecurring ? (dueDate || toDateStr(today())) : null,
      }
      if (editing && task) {
        const { error } = await supabase.from('tasks').update(payload).eq('id', task.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('tasks').insert({ ...payload, boat_id: boat!.id }).select('id').single()
        if (error) throw error
        // Ping the assignee that they've been given a task (best-effort).
        if (data && assignedTo) notifyTaskAssigned(data.id)
      }
      qc.invalidateQueries({ queryKey: ['tasks_view'] })
      qc.invalidateQueries({ queryKey: ['tasks_dots'] })
      qc.invalidateQueries({ queryKey: ['recurring_templates'] })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!task) return
    if (!confirm('Delete this task?')) return
    setBusy(true)
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    if (error) { setError(error.message); setBusy(false); return }
    qc.invalidateQueries({ queryKey: ['tasks_view'] })
    qc.invalidateQueries({ queryKey: ['tasks_dots'] })
    qc.invalidateQueries({ queryKey: ['recurring_templates'] })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={editing ? 'Edit task' : 'New task'} maxHeight="92vh">
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label className="label">Title</label>
          <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Service the watermaker" autoFocus />
        </div>
        <div>
          <label className="label">Details (optional)</label>
          <textarea className="input" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Notes, steps, parts needed…" />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="label">Assign to</label>
            <select className="input" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
              <option value="">Anyone</option>
              {crew.map(c => <option key={c.id} value={c.id}>{c.full_name} · {ROLE_LABELS[c.role]}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">Due</label>
            <input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Shift</label>
          <div className="segmented">
            <button data-active={shift === 'day'} onClick={() => setShift('day')}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Sun size={15} /> Day</span>
            </button>
            <button data-active={shift === 'night'} onClick={() => setShift('night')}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Moon size={15} /> Night watch</span>
            </button>
          </div>
        </div>

        {/* Repeat */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, background: 'var(--color-surface-2, var(--color-base))' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14.5 }}>
            <Repeat2 size={16} style={{ color: isRecurring ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }} /> Repeat
          </span>
          <button
            role="switch" aria-checked={isRecurring} onClick={() => setIsRecurring(v => !v)}
            style={{ width: 46, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer', position: 'relative', background: isRecurring ? 'var(--color-accent)' : 'var(--color-border, #ccd2d8)', transition: 'background .15s' }}
          >
            <span style={{ position: 'absolute', top: 3, left: isRecurring ? 21 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
          </button>
        </div>
        {isRecurring && (
          <div className="segmented">
            {RECURRENCES.map(r => <button key={r.v} data-active={recurrenceType === r.v} onClick={() => setRecurrenceType(r.v)}>{r.label}</button>)}
          </div>
        )}

        {!isRecurring && (
          <div>
            <label className="label">Status</label>
            <div className="segmented">
              {STATUSES.map(s => <button key={s.v} data-active={status === s.v} onClick={() => setStatus(s.v)}>{s.label}</button>)}
            </div>
          </div>
        )}

        {error && <div style={{ padding: '11px 14px', borderRadius: 12, background: 'var(--color-danger-dim)', color: 'var(--color-danger)', fontSize: 13.5 }}>{error}</div>}

        <button className="btn btn-primary btn-block" style={{ height: 52, fontSize: 16 }} onClick={save} disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save task' : 'Add task'}
        </button>
        {editing && (
          <button className="btn btn-danger btn-block" onClick={remove} disabled={busy} style={{ marginBottom: 4 }}>
            <Trash2 size={17} /> Delete task
          </button>
        )}
      </div>
    </Sheet>
  )
}

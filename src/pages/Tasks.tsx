import { useMemo, useRef, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus, ListChecks, Circle, CircleDot, CheckCircle2, Calendar, Repeat2, CornerDownRight } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import TaskSheet from '@/components/TaskSheet'
import Sheet from '@/components/Sheet'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useCrew } from '@/hooks/useCrew'
import { canManageTasks } from '@/lib/permissions'
import { notifyTaskCompleted } from '@/lib/api'
import { formatDate, initials } from '@/lib/formatters'
import { toDateStr, today, buildDayStrip, occursOnDate, recurrenceLabel } from '@/lib/taskScheduling'
import { isToday } from 'date-fns'
import type { Task, TaskStatus, DisplayTask, TaskCompletion } from '@/types'

type StatusFilter = 'open' | 'in_progress' | 'done'
type ShiftFilter = 'all' | 'day' | 'night'
const NEXT: Record<TaskStatus, TaskStatus> = { open: 'in_progress', in_progress: 'done', done: 'open' }
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Tasks() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const canManage = profile ? canManageTasks(profile.role) : false
  const { data: crew = [] } = useCrew()
  const days = useMemo(() => buildDayStrip(), [])
  const stripRef = useRef<HTMLDivElement>(null)

  const [selected, setSelected] = useState<Date>(today)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>('all')
  const [editing, setEditing] = useState<Task | null>(null)
  const [creating, setCreating] = useState(false)
  const [recurringAction, setRecurringAction] = useState<DisplayTask | null>(null)

  const dateKey = toDateStr(selected)
  const todayKey = toDateStr(today())

  // Centre today on first paint.
  useEffect(() => {
    const el = stripRef.current
    const chip = el?.querySelector('[data-today="true"]') as HTMLElement | null
    if (el && chip) el.scrollLeft = chip.offsetLeft - el.clientWidth / 2 + chip.offsetWidth / 2
  }, [])

  // ── Day's tasks: one-off (on day) + recurring occurrences + carry-over ──
  const { data: dayTasks = [], isLoading } = useQuery<DisplayTask[]>({
    queryKey: ['tasks_view', dateKey],
    queryFn: async () => {
      const [oneOffRes, carryRes, recurringRes] = await Promise.all([
        supabase.from('tasks').select('*').eq('due_date', dateKey).eq('is_recurring', false).order('created_at', { ascending: true }),
        dateKey >= todayKey
          ? supabase.from('tasks').select('*').lt('due_date', dateKey).eq('is_recurring', false).neq('status', 'done').order('due_date', { ascending: true })
          : Promise.resolve({ data: [] as Task[] }),
        supabase.from('tasks').select('*').eq('is_recurring', true).lte('recurrence_start_date', dateKey),
      ])

      const oneOff: DisplayTask[] = (oneOffRes.data ?? [])
      const carried: DisplayTask[] = (carryRes.data ?? []).map(t => ({ ...t, _carriedOver: true }))

      const templates = (recurringRes.data ?? []).filter(t => occursOnDate(t, selected))
      let completions: TaskCompletion[] = []
      if (templates.length) {
        const { data } = await supabase.from('task_completions').select('*').in('task_id', templates.map(t => t.id)).eq('occurrence_date', dateKey)
        completions = data ?? []
      }
      const recurring: DisplayTask[] = templates
        .filter(t => !completions.find(c => c.task_id === t.id && c.skipped))
        .map(t => {
          const comp = completions.find(c => c.task_id === t.id)
          return { ...t, _occurrence: dateKey, _completionId: comp?.id, _occurrenceDone: comp?.done ?? false }
        })

      return [...oneOff, ...recurring, ...carried]
    },
  })

  // ── Dots: which days have anything unfinished (one-off only; cheap) ──
  const { data: dotDays = new Set<string>() } = useQuery<Set<string>>({
    queryKey: ['tasks_dots'],
    queryFn: async () => {
      const start = toDateStr(days[0]); const end = toDateStr(days[days.length - 1])
      const { data } = await supabase.from('tasks').select('due_date,status,is_recurring').gte('due_date', start).lte('due_date', end).eq('is_recurring', false).neq('status', 'done')
      const s = new Set<string>()
      ;(data ?? []).forEach(t => t.due_date && s.add(t.due_date))
      return s
    },
  })
  const { data: recurringTemplates = [] } = useQuery<Task[]>({
    queryKey: ['recurring_templates'],
    queryFn: async () => (await supabase.from('tasks').select('*').eq('is_recurring', true)).data ?? [],
  })

  // ── Derived: apply shift filter, split by status ──
  const visible = dayTasks.filter(t => shiftFilter === 'all' || t.shift === shiftFilter)
  const isDone = (t: DisplayTask) => t.is_recurring ? !!t._occurrenceDone : t.status === 'done'
  const counts = {
    open: visible.filter(t => !isDone(t) && (t.is_recurring || t.status === 'open')).length,
    in_progress: visible.filter(t => !t.is_recurring && t.status === 'in_progress').length,
    done: visible.filter(t => isDone(t)).length,
  }
  const inSegment = (t: DisplayTask): boolean => {
    if (statusFilter === 'done') return isDone(t)
    if (statusFilter === 'in_progress') return !t.is_recurring && t.status === 'in_progress'
    // 'open' bucket: not done, and either recurring (no status) or status open
    return !isDone(t) && (t.is_recurring || t.status === 'open')
  }
  const filtered = visible.filter(inSegment)
  const crewName = (id: string | null) => crew.find(c => c.id === id)?.full_name ?? 'Anyone'

  // ── Toggle status / completion ──
  async function cycle(task: DisplayTask) {
    if (task.is_recurring) {
      const nextDone = !task._occurrenceDone
      qc.setQueryData<DisplayTask[]>(['tasks_view', dateKey], prev => prev?.map(t => t.id === task.id && t._occurrence === task._occurrence ? { ...t, _occurrenceDone: nextDone } : t))
      if (task._completionId) {
        const { error } = await supabase.from('task_completions').update({ done: nextDone }).eq('id', task._completionId)
        if (error) qc.invalidateQueries({ queryKey: ['tasks_view'] })
      } else {
        const { data, error } = await supabase.from('task_completions').insert({ boat_id: task.boat_id, task_id: task.id, occurrence_date: task._occurrence ?? dateKey, done: nextDone, skipped: false }).select().single()
        if (error) qc.invalidateQueries({ queryKey: ['tasks_view'] })
        else if (data) qc.setQueryData<DisplayTask[]>(['tasks_view', dateKey], prev => prev?.map(t => t.id === task.id && t._occurrence === task._occurrence ? { ...t, _completionId: data.id } : t))
      }
      if (nextDone) notifyTaskCompleted(task.id)
      return
    }
    const next = NEXT[task.status]
    qc.setQueryData<DisplayTask[]>(['tasks_view', dateKey], prev => prev?.map(t => t.id === task.id ? { ...t, status: next } : t))
    const { error } = await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    if (error) qc.invalidateQueries({ queryKey: ['tasks_view'] })
    qc.invalidateQueries({ queryKey: ['tasks_dots'] })
    if (next === 'done') notifyTaskCompleted(task.id)
  }

  // ── Recurring: skip just this day, or delete the whole series ──
  async function skipOccurrence(task: DisplayTask) {
    const occ = task._occurrence ?? dateKey
    qc.setQueryData<DisplayTask[]>(['tasks_view', dateKey], prev => prev?.filter(t => !(t.id === task.id && t._occurrence === occ)))
    if (task._completionId) {
      await supabase.from('task_completions').update({ skipped: true, done: false }).eq('id', task._completionId)
    } else {
      await supabase.from('task_completions').insert({ boat_id: task.boat_id, task_id: task.id, occurrence_date: occ, done: false, skipped: true })
    }
    setRecurringAction(null)
  }

  async function deleteSeries(task: DisplayTask) {
    qc.setQueryData<DisplayTask[]>(['tasks_view', dateKey], prev => prev?.filter(t => t.id !== task.id))
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    if (error) qc.invalidateQueries({ queryKey: ['tasks_view'] })
    qc.invalidateQueries({ queryKey: ['recurring_templates'] })
    qc.invalidateQueries({ queryKey: ['tasks_dots'] })
    setRecurringAction(null)
  }

  const StatusIcon = (t: DisplayTask) =>
    isDone(t) ? <CheckCircle2 size={22} style={{ color: 'var(--color-success)' }} />
    : (!t.is_recurring && t.status === 'in_progress') ? <CircleDot size={22} style={{ color: 'var(--color-accent)' }} />
    : <Circle size={22} style={{ color: 'var(--color-text-faint)' }} />

  const headingDate = isToday(selected) ? `Today — ${formatDate(dateKey, 'd MMM')}` : formatDate(dateKey, 'EEEE, d MMM')

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={`${counts.open + counts.in_progress} open`}
        action={canManage && <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Plus size={17} /> New</button>}
      />

      {/* Day strip */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--color-divider)' }}>
        <button onClick={() => stripRef.current?.scrollBy({ left: -180, behavior: 'smooth' })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px 0 10px', color: 'var(--color-text-tertiary)' }}><ChevronLeft size={18} /></button>
        <div ref={stripRef} style={{ display: 'flex', gap: 3, overflowX: 'auto', padding: '9px 4px', flex: 1, scrollbarWidth: 'none' }}>
          {days.map(day => {
            const ds = toDateStr(day)
            const sel = ds === dateKey
            const has = dotDays.has(ds) || recurringTemplates.some(t => occursOnDate(t, day))
            return (
              <button key={ds} data-today={isToday(day) ? 'true' : undefined} onClick={() => setSelected(day)}
                style={{ flex: '0 0 auto', width: 46, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '7px 0 5px', borderRadius: 13, border: 'none', cursor: 'pointer', background: sel ? 'var(--color-accent)' : 'transparent' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: sel ? 'rgba(255,255,255,.8)' : 'var(--color-text-tertiary)' }}>{DOW[day.getDay()]}</span>
                <span style={{ fontSize: 17, fontWeight: 700, color: sel ? '#fff' : isToday(day) ? 'var(--color-accent)' : 'var(--color-text-primary)' }}>{day.getDate()}</span>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: has ? (sel ? 'rgba(255,255,255,.85)' : 'var(--color-accent)') : 'transparent' }} />
              </button>
            )
          })}
        </div>
        <button onClick={() => stripRef.current?.scrollBy({ left: 180, behavior: 'smooth' })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 10px 0 4px', color: 'var(--color-text-tertiary)' }}><ChevronRight size={18} /></button>
      </div>

      {/* Shift filter chips */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px 4px' }}>
        {([['all', 'All'], ['day', '☀︎ Day'], ['night', '🌙 Night watch']] as [ShiftFilter, string][]).map(([v, label]) => (
          <button key={v} onClick={() => setShiftFilter(v)} className="chip" data-active={shiftFilter === v}
            style={{ fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--color-divider)',
              background: shiftFilter === v ? (v === 'night' ? 'var(--color-accent)' : 'var(--color-text-primary)') : 'var(--color-surface)',
              color: shiftFilter === v ? (v === 'night' ? '#fff' : 'var(--color-base)') : 'var(--color-text-secondary)' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Day label + status segments */}
      <div style={{ padding: '6px 16px 0' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-secondary)', padding: '6px 2px 8px' }}>{headingDate}</div>
        <div className="segmented">
          <button data-active={statusFilter === 'open'} onClick={() => setStatusFilter('open')}>To do {counts.open ? `· ${counts.open}` : ''}</button>
          <button data-active={statusFilter === 'in_progress'} onClick={() => setStatusFilter('in_progress')}>Doing {counts.in_progress ? `· ${counts.in_progress}` : ''}</button>
          <button data-active={statusFilter === 'done'} onClick={() => setStatusFilter('done')}>Done</button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 14 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={statusFilter === 'done' ? 'Nothing done yet' : 'No tasks here'}
          message={canManage ? 'Add a task for this day.' : 'Tasks assigned to you will show here.'}
          action={canManage && statusFilter !== 'done' && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18} /> New task</button>}
        />
      ) : (
        <div style={{ padding: '8px 16px 16px' }}>
          {statusFilter !== 'done' && (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: '0 8px 10px', lineHeight: 1.4 }}>
              Tap the circle to move a task <b>To&nbsp;do → Doing → Done</b>
            </div>
          )}
          <div className="list-group">
            {filtered.map(task => (
              <div key={`${task.id}-${task._occurrence ?? 'one'}`} className="list-row" style={{ alignItems: 'flex-start', paddingTop: 13, paddingBottom: 13, borderLeft: task._carriedOver ? '3px solid var(--color-warning, #E0922F)' : task.shift === 'night' ? '3px solid var(--color-accent)' : '3px solid transparent' }}>
                <button onClick={() => cycle(task)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 1, flexShrink: 0 }} aria-label="Toggle status">
                  {StatusIcon(task)}
                </button>
                <div style={{ flex: 1, minWidth: 0, cursor: canManage ? 'pointer' : 'default' }} onClick={() => { if (!canManage) return; if (task.is_recurring) setRecurringAction(task); else setEditing(task) }}>
                  <div style={{ fontWeight: 600, textDecoration: isDone(task) ? 'line-through' : 'none', color: isDone(task) ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)' }}>
                    {task.title}
                  </div>
                  {task.description && <div style={{ fontSize: 13.5, color: 'var(--color-text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.description}</div>}
                  <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 12.5, color: 'var(--color-text-tertiary)', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--color-accent)', color: '#fff', fontSize: 9.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{task.assigned_to ? initials(crewName(task.assigned_to)) : '—'}</span>
                      {crewName(task.assigned_to)}
                    </span>
                    {task.shift === 'night' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--color-accent)', fontWeight: 600 }}>🌙 Night</span>}
                    {task.is_recurring && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Repeat2 size={12} /> {recurrenceLabel(task.recurrence_type)}</span>}
                    {task._carriedOver && task.due_date && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--color-warning, #E0922F)', fontWeight: 600 }}><CornerDownRight size={12} /> From {formatDate(task.due_date, 'EEE d MMM')}</span>}
                    {!task._carriedOver && !task.is_recurring && task.due_date && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calendar size={12} /> {formatDate(task.due_date, 'd MMM')}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <TaskSheet open={creating} onClose={() => setCreating(false)} defaultDate={dateKey} />
      <TaskSheet open={!!editing} onClose={() => setEditing(null)} task={editing} />

      {/* Recurring task: skip this day or delete the whole series */}
      <Sheet open={!!recurringAction} onClose={() => setRecurringAction(null)} title="Recurring task" maxHeight="60vh">
        {recurringAction && (
          <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 14.5, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              “{recurringAction.title}” repeats {recurrenceLabel(recurringAction.recurrence_type).toLowerCase()}.
            </div>
            <button
              onClick={() => skipOccurrence(recurringAction)}
              style={{ width: '100%', padding: '15px 0', borderRadius: 14, border: 'none', cursor: 'pointer', fontSize: 15.5, fontWeight: 600, background: 'var(--color-surface)', color: 'var(--color-text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
              Skip {formatDate(recurringAction._occurrence ?? dateKey, 'EEE d MMM')} only
            </button>
            <button
              onClick={() => deleteSeries(recurringAction)}
              style={{ width: '100%', padding: '15px 0', borderRadius: 14, border: 'none', cursor: 'pointer', fontSize: 15.5, fontWeight: 600, background: 'var(--color-danger-dim)', color: 'var(--color-danger)' }}>
              Delete entire series
            </button>
            <button
              onClick={() => setRecurringAction(null)}
              style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 500, background: 'transparent', color: 'var(--color-text-secondary)' }}>
              Cancel
            </button>
          </div>
        )}
      </Sheet>
    </>
  )
}

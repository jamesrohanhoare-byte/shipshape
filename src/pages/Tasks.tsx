import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ListChecks, Circle, CircleDot, CheckCircle2, Calendar } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import TaskSheet from '@/components/TaskSheet'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useCrew } from '@/hooks/useCrew'
import { canManageTasks } from '@/lib/permissions'
import { formatDate } from '@/lib/formatters'
import type { Task, TaskStatus } from '@/types'

type Filter = 'open' | 'in_progress' | 'done'
const NEXT: Record<TaskStatus, TaskStatus> = { open: 'in_progress', in_progress: 'done', done: 'open' }

export default function Tasks() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const canManage = profile ? canManageTasks(profile.role) : false
  const { data: crew = [] } = useCrew()
  const [filter, setFilter] = useState<Filter>('open')
  const [editing, setEditing] = useState<Task | null>(null)
  const [creating, setCreating] = useState(false)

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const counts = useMemo(() => ({
    open: tasks.filter(t => t.status === 'open').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
  }), [tasks])

  const filtered = tasks.filter(t => t.status === filter)
  const crewName = (id: string | null) => crew.find(c => c.id === id)?.full_name ?? 'Anyone'

  async function cycle(task: Task) {
    const next = NEXT[task.status]
    // optimistic
    qc.setQueryData<Task[]>(['tasks'], prev => prev?.map(t => t.id === task.id ? { ...t, status: next } : t))
    const { error } = await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    if (error) qc.invalidateQueries({ queryKey: ['tasks'] })
  }

  const StatusIcon = (s: TaskStatus) =>
    s === 'done' ? <CheckCircle2 size={22} style={{ color: 'var(--color-success)' }} />
    : s === 'in_progress' ? <CircleDot size={22} style={{ color: 'var(--color-accent)' }} />
    : <Circle size={22} style={{ color: 'var(--color-text-faint)' }} />

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={`${counts.open + counts.in_progress} open`}
        action={canManage && <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Plus size={17} /> New</button>}
      />

      <div style={{ padding: '4px 16px 8px' }}>
        <div className="segmented">
          <button data-active={filter === 'open'} onClick={() => setFilter('open')}>To do {counts.open ? `· ${counts.open}` : ''}</button>
          <button data-active={filter === 'in_progress'} onClick={() => setFilter('in_progress')}>Doing {counts.in_progress ? `· ${counts.in_progress}` : ''}</button>
          <button data-active={filter === 'done'} onClick={() => setFilter('done')}>Done</button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 14 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={filter === 'done' ? 'Nothing done yet' : 'No tasks here'}
          message={canManage ? 'Add a task for the crew or engineers.' : 'Tasks assigned to you will show here.'}
          action={canManage && filter !== 'done' && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18} /> New task</button>}
        />
      ) : (
        <div style={{ padding: '4px 16px' }}>
          <div className="list-group">
            {filtered.map(task => (
              <div key={task.id} className="list-row" style={{ alignItems: 'flex-start', paddingTop: 13, paddingBottom: 13 }}>
                <button onClick={() => cycle(task)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 1, flexShrink: 0 }} aria-label="Toggle status">
                  {StatusIcon(task.status)}
                </button>
                <div style={{ flex: 1, minWidth: 0, cursor: canManage ? 'pointer' : 'default' }} onClick={() => canManage && setEditing(task)}>
                  <div style={{ fontWeight: 600, textDecoration: task.status === 'done' ? 'line-through' : 'none', color: task.status === 'done' ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)' }}>
                    {task.title}
                  </div>
                  {task.description && <div style={{ fontSize: 13.5, color: 'var(--color-text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.description}</div>}
                  <div style={{ display: 'flex', gap: 12, marginTop: 5, fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>
                    <span>{crewName(task.assigned_to)}</span>
                    {task.due_date && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calendar size={12} /> {formatDate(task.due_date, 'd MMM')}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <TaskSheet open={creating} onClose={() => setCreating(false)} />
      <TaskSheet open={!!editing} onClose={() => setEditing(null)} task={editing} />
    </>
  )
}

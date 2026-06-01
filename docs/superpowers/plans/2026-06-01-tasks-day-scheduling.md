# Tasks Day-Scheduling Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild ShipShape's Tasks screen into a day-centric board — a horizontal day strip, status-segmented list (Variant A), Day/Night-watch filter, recurring tasks, and carry-over of unfinished work — combining BlitzBooks' time engine with ShipShape's crew/status model.

**Architecture:** Anchor every task to a day (`due_date`). One-off tasks keep the full `open → in_progress → done` status. Recurring tasks repeat daily/weekly/monthly and track per-day completion in a new `task_completions` table (simple done/skipped — no per-occurrence status). Anything not `done` whose `due_date` is in the past carries forward to today, visibly badged. A `shift` flag (`day`/`night`) on each task drives a filter chip; Night Watch is a tag, not a status.

**Tech Stack:** React 19 · TypeScript · TanStack Query · date-fns 4 · Framer Motion · Supabase (Postgres + RLS) · Vercel.

> **Verification note — read before executing.** This project has **no unit-test harness** (no vitest/jest in `package.json`). It ships on `npm run build` (tsc + vite) green, `npm run lint` clean, a **simulated-RLS SQL check** for DB changes, and a **manual UAT checklist**. This plan uses those as the verification gates instead of TDD red/green. Do **not** add a test framework — that's scope the project hasn't asked for and contradicts its shipped v1.5 discipline (YAGNI).

> **Deploy reminder (from HANDOVER.md):** git push does NOT auto-deploy. After committing, run `vercel --prod --yes` from the project dir and verify the bundle hash changed. DB changes apply via the Supabase Management API. Edge functions are untouched by this plan.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/00007_tasks_scheduling.sql` | Create | Add `shift` + recurrence columns to `tasks`; create boat-scoped `task_completions` table + RLS. |
| `supabase/migrations/setup_all.sql` | Modify | Append 00007 so the concatenated bootstrap stays current. |
| `src/types/index.ts` | Modify | Extend `Task`; add `TaskShift`, `RecurrenceType`, `TaskCompletion`, `DisplayTask`. |
| `src/lib/taskScheduling.ts` | Create | Pure date/recurrence helpers (day strip, `occursOnDate`, keys, labels). No React, no Supabase. |
| `src/components/TaskSheet.tsx` | Modify | Add Shift toggle, Repeat toggle + recurrence selector; default `due_date` to the selected day. |
| `src/pages/Tasks.tsx` | Rewrite | Day strip + status-segmented Variant A + Day/Night chips + carry-over + recurring expansion. |
| `src/lib/version.ts` | Modify | Bump `APP_VERSION` to `1.6.0`. |

**Constants locked across tasks (use these exact names):**
- Task type: `TaskShift = 'day' | 'night'`, `RecurrenceType = 'daily' | 'weekly' | 'monthly'`.
- New `tasks` columns: `shift` (default `'day'`), `is_recurring` (default `false`), `recurrence_type` (nullable), `recurrence_start_date` (nullable).
- `task_completions` columns: `id`, `boat_id`, `task_id`, `occurrence_date`, `done`, `skipped`, `created_at`.
- Helper names: `toDateStr`, `buildDayStrip`, `occursOnDate`, `recurrenceLabel`.
- Query keys: `['tasks_view', dateKey]`, `['tasks_dots']`, `['recurring_templates']`.

---

## Task 1: Database migration — scheduling columns + completions table

**Files:**
- Create: `supabase/migrations/00007_tasks_scheduling.sql`
- Modify: `supabase/migrations/setup_all.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/00007_tasks_scheduling.sql`:

```sql
-- ============================================================
-- ShipShape 00007 — task scheduling: shift flag, recurrence,
-- and per-occurrence completions for recurring tasks.
-- ============================================================

-- ── Extend tasks ──────────────────────────────────────────────
alter table public.tasks
  add column if not exists shift text not null default 'day'
    check (shift in ('day','night')),
  add column if not exists is_recurring boolean not null default false,
  add column if not exists recurrence_type text
    check (recurrence_type in ('daily','weekly','monthly')),
  add column if not exists recurrence_start_date date;

-- ── Per-occurrence completion for recurring tasks ─────────────
-- A recurring task is a single tasks row (the template). Each day it
-- "occurs", its done/skipped state for THAT day lives here. One-off
-- tasks ignore this table and use tasks.status directly.
create table if not exists public.task_completions (
  id              uuid primary key default gen_random_uuid(),
  boat_id         uuid not null references public.boats(id) on delete cascade,
  task_id         uuid not null references public.tasks(id) on delete cascade,
  occurrence_date date not null,
  done            boolean not null default false,
  skipped         boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (task_id, occurrence_date)
);
create index if not exists task_completions_boat_idx on public.task_completions(boat_id);
create index if not exists task_completions_task_idx on public.task_completions(task_id);

alter table public.task_completions enable row level security;

-- Boat-scoped: everyone on the boat can read and write completions.
-- Ticking a recurring chore is part of the daily loop for ALL roles
-- (mirrors stock-deduct being allowed for everyone). Tenant isolation
-- is enforced by boat_id; this is NOT a blanket auth.uid() IS NOT NULL.
create policy "task_completions_select" on public.task_completions for select
  using (boat_id = public.get_user_boat_id());
create policy "task_completions_insert" on public.task_completions for insert
  with check (boat_id = public.get_user_boat_id());
create policy "task_completions_update" on public.task_completions for update
  using (boat_id = public.get_user_boat_id())
  with check (boat_id = public.get_user_boat_id());
create policy "task_completions_delete" on public.task_completions for delete
  using (boat_id = public.get_user_boat_id());
```

- [ ] **Step 2: Apply the migration via the Management API**

Run (substitute the real `SUPABASE_ACCESS_TOKEN`; project ref is `mornbzqtcpugyzxnclfb`). Pass the SQL as the `query` value:

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/mornbzqtcpugyzxnclfb/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{"query":"<paste the full 00007 SQL here, newlines escaped as \\n>"}
JSON
```

Expected: `[]` (empty success array), no error object.

- [ ] **Step 3: Verify the schema landed**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/mornbzqtcpugyzxnclfb/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select column_name from information_schema.columns where table_name=''tasks'' and column_name in (''shift'',''is_recurring'',''recurrence_type'',''recurrence_start_date'') order by column_name;"}'
```

Expected: four rows — `is_recurring`, `recurrence_start_date`, `recurrence_type`, `shift`.

- [ ] **Step 4: Simulated-RLS check (tenant isolation on the new table)**

Confirm `task_completions` is boat-scoped. Run as a check that the policy references `get_user_boat_id` and RLS is enabled:

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/mornbzqtcpugyzxnclfb/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select relrowsecurity from pg_class where relname=''task_completions'';"}'
```

Expected: `relrowsecurity = true`. If false, RLS is off — STOP and fix before continuing.

- [ ] **Step 5: Regenerate `setup_all.sql`**

Append the full contents of `00007_tasks_scheduling.sql` to the end of `supabase/migrations/setup_all.sql` (it is the in-order concatenation of every migration). Keep ordering: 00007 goes last.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/00007_tasks_scheduling.sql supabase/migrations/setup_all.sql
git commit -m "feat(db): task scheduling — shift flag, recurrence, task_completions (00007)"
```

---

## Task 2: Extend the TypeScript types

**Files:**
- Modify: `src/types/index.ts:70-82`

- [ ] **Step 1: Replace the Task block with the extended types**

Replace lines 70–82 (the `TaskStatus` + `Task` block) with:

```typescript
export type TaskStatus = 'open' | 'in_progress' | 'done'
export type TaskShift = 'day' | 'night'
export type RecurrenceType = 'daily' | 'weekly' | 'monthly'

export interface Task {
  id: string
  boat_id: string
  title: string
  description: string | null
  assigned_to: string | null
  status: TaskStatus
  due_date: string | null
  shift: TaskShift
  is_recurring: boolean
  recurrence_type: RecurrenceType | null
  recurrence_start_date: string | null
  created_by: string | null
  created_at: string
}

export interface TaskCompletion {
  id: string
  boat_id: string
  task_id: string
  occurrence_date: string
  done: boolean
  skipped: boolean
  created_at: string
}

/** A task as rendered on a specific day — may be a recurring occurrence or a carry-over. */
export interface DisplayTask extends Task {
  _carriedOver?: boolean
  _occurrence?: string      // recurring: the date this occurrence is for
  _completionId?: string    // recurring: existing task_completions row id
  _occurrenceDone?: boolean // recurring: done state for this occurrence
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: PASS (tsc finds no missing-property errors). Existing `TaskSheet`/`Tasks` may error on the new required fields — that is expected and fixed in Tasks 4–5. If you want an isolated check, run `npx tsc -b --noEmit` and confirm the only errors are in `TaskSheet.tsx` / `Tasks.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add shift, recurrence, TaskCompletion, DisplayTask"
```

---

## Task 3: Pure scheduling helpers

**Files:**
- Create: `src/lib/taskScheduling.ts`

- [ ] **Step 1: Write the helper module**

Create `src/lib/taskScheduling.ts`:

```typescript
import { addDays, subDays, format, parseISO } from 'date-fns'
import type { Task, RecurrenceType } from '@/types'

/** yyyy-MM-dd key for a Date (local). */
export function toDateStr(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

/** Midnight-normalised "today". */
export function today(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** 28-day window: 7 days back → 20 days forward from today. */
export function buildDayStrip(): Date[] {
  const start = subDays(today(), 7)
  return Array.from({ length: 28 }, (_, i) => addDays(start, i))
}

/** Does a recurring template occur on the given date? */
export function occursOnDate(task: Task, date: Date): boolean {
  if (!task.is_recurring || !task.recurrence_start_date) return false
  const start = parseISO(task.recurrence_start_date)
  start.setHours(0, 0, 0, 0)
  if (date < start) return false
  switch (task.recurrence_type) {
    case 'daily': return true
    case 'weekly': return date.getDay() === start.getDay()
    case 'monthly': return date.getDate() === start.getDate()
    default: return false
  }
}

export function recurrenceLabel(type: RecurrenceType | null): string {
  if (type === 'daily') return 'Daily'
  if (type === 'weekly') return 'Weekly'
  if (type === 'monthly') return 'Monthly'
  return ''
}
```

- [ ] **Step 2: Type-check the module compiles**

Run: `npx tsc -b --noEmit`
Expected: no new errors in `src/lib/taskScheduling.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/taskScheduling.ts
git commit -m "feat(tasks): pure day-strip + recurrence helpers"
```

---

## Task 4: TaskSheet — shift toggle, repeat, default due date

**Files:**
- Modify: `src/components/TaskSheet.tsx` (full replacement)

- [ ] **Step 1: Replace the file**

Replace the entire contents of `src/components/TaskSheet.tsx` with:

```tsx
import { useEffect, useState } from 'react'
import { Trash2, Sun, Moon, Repeat2 } from 'lucide-react'
import Sheet from './Sheet'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useCrew } from '@/hooks/useCrew'
import { useQueryClient } from '@tanstack/react-query'
import { ROLE_LABELS } from '@/lib/permissions'
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
        const { error } = await supabase.from('tasks').insert({ ...payload, boat_id: boat!.id })
        if (error) throw error
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
              <Sun size={15} style={{ verticalAlign: -2, marginRight: 5 }} />Day
            </button>
            <button data-active={shift === 'night'} onClick={() => setShift('night')}>
              <Moon size={15} style={{ verticalAlign: -2, marginRight: 5 }} />Night watch
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
```

Notes: recurring tasks hide the Status segment (they use per-occurrence done, not status — the decision locked in design). `recurrence_start_date` defaults to the due date so the series starts on the chosen day.

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors in `TaskSheet.tsx` (errors may remain in `Tasks.tsx` until Task 5).

- [ ] **Step 3: Commit**

```bash
git add src/components/TaskSheet.tsx
git commit -m "feat(tasks): shift toggle, repeat + recurrence, default due date in TaskSheet"
```

---

## Task 5: Tasks page — day strip + Variant A board + carry-over

**Files:**
- Rewrite: `src/pages/Tasks.tsx` (full replacement)

- [ ] **Step 1: Replace the file**

Replace the entire contents of `src/pages/Tasks.tsx` with:

```tsx
import { useMemo, useRef, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus, ListChecks, Circle, CircleDot, CheckCircle2, Calendar, Repeat2, CornerDownRight } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import TaskSheet from '@/components/TaskSheet'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useCrew } from '@/hooks/useCrew'
import { canManageTasks } from '@/lib/permissions'
import { formatDate, initials } from '@/lib/formatters'
import { toDateStr, today, buildDayStrip, occursOnDate, recurrenceLabel } from '@/lib/taskScheduling'
import { isToday, parseISO } from 'date-fns'
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
  const days = useMemo(buildDayStrip, [])
  const stripRef = useRef<HTMLDivElement>(null)

  const [selected, setSelected] = useState<Date>(today)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>('all')
  const [editing, setEditing] = useState<Task | null>(null)
  const [creating, setCreating] = useState(false)

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
        await supabase.from('task_completions').update({ done: nextDone }).eq('id', task._completionId)
      } else {
        const { data } = await supabase.from('task_completions').insert({ boat_id: task.boat_id, task_id: task.id, occurrence_date: task._occurrence ?? dateKey, done: nextDone, skipped: false }).select().single()
        if (data) qc.setQueryData<DisplayTask[]>(['tasks_view', dateKey], prev => prev?.map(t => t.id === task.id && t._occurrence === task._occurrence ? { ...t, _completionId: data.id } : t))
      }
      return
    }
    const next = NEXT[task.status]
    qc.setQueryData<DisplayTask[]>(['tasks_view', dateKey], prev => prev?.map(t => t.id === task.id ? { ...t, status: next } : t))
    const { error } = await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    if (error) qc.invalidateQueries({ queryKey: ['tasks_view'] })
    qc.invalidateQueries({ queryKey: ['tasks_dots'] })
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
              color: shiftFilter === v ? '#fff' : 'var(--color-text-secondary)' }}>
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
          <div className="list-group">
            {filtered.map(task => (
              <div key={`${task.id}-${task._occurrence ?? 'one'}`} className="list-row" style={{ alignItems: 'flex-start', paddingTop: 13, paddingBottom: 13, borderLeft: task._carriedOver ? '3px solid var(--color-warning, #E0922F)' : task.shift === 'night' ? '3px solid var(--color-accent)' : '3px solid transparent' }}>
                <button onClick={() => cycle(task)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 1, flexShrink: 0 }} aria-label="Toggle status">
                  {StatusIcon(task)}
                </button>
                <div style={{ flex: 1, minWidth: 0, cursor: canManage && !task.is_recurring ? 'pointer' : 'default' }} onClick={() => canManage && !task.is_recurring && setEditing(task)}>
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
    </>
  )
}
```

- [ ] **Step 2: Full type-check + build**

Run: `npm run build`
Expected: PASS — tsc clean, vite bundles. If `var(--color-warning)`/`var(--color-surface-2)` tokens don't exist, the inline fallbacks (`, #E0922F` / `, var(--color-base)`) cover them; no build impact.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean (no unused imports — confirm every imported icon/util is used; remove any that aren't).

- [ ] **Step 4: Commit**

```bash
git add src/pages/Tasks.tsx
git commit -m "feat(tasks): day-strip board, status segments, shift filter, carry-over, recurrence"
```

---

## Task 6: Version bump, deploy, UAT

**Files:**
- Modify: `src/lib/version.ts`

- [ ] **Step 1: Bump version**

Edit `src/lib/version.ts`: set `export const APP_VERSION = '1.6.0'`.

- [ ] **Step 2: Build to confirm green**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit + push**

```bash
git add src/lib/version.ts
git commit -m "chore: bump to v1.6.0 — tasks day-scheduling"
git push
```

- [ ] **Step 4: Deploy (git push does NOT auto-deploy)**

Run from the project dir: `vercel --prod --yes`
Then verify the live bundle changed:
`curl -s https://shipshape-ebon.vercel.app | grep -o '/assets/index-[^"]*\.js' | head -1`
Expected: a hash different from the previous deploy.

- [ ] **Step 5: Manual UAT (on the live site, SocialYaht login)**

Confirm each:
- [ ] Day strip shows ~4 weeks; today is centred and accent-highlighted; days with unfinished tasks show a dot.
- [ ] Tapping a day switches the board to that day's tasks.
- [ ] Create a one-off task with a due date → it appears on that day under "To do"; tapping the status circle cycles To do → Doing → Done; it moves between segments.
- [ ] Create a task with Shift = Night watch → it shows the 🌙 marker + accent edge; the "🌙 Night watch" chip filters to only it; "☀︎ Day" hides it.
- [ ] Create a Repeating (Daily) task → it appears every day; ticking it done on today does NOT tick it on tomorrow (per-occurrence); the Status segment is hidden for recurring in the sheet.
- [ ] Leave a one-off task from a past day un-done → it appears on **today** under "To do" badged "From <date>" with the amber edge.
- [ ] As a deckhand login, tick a recurring chore done → it persists (RLS allows the completion write).

- [ ] **Step 6: Update HANDOVER + memory**

- Add a v1.6.0 line to `HANDOVER.md` §8 and note migrations now `00001–00007` + the `task_completions` table in §7.
- Update memory `project_shipshape.md` (migrations 00007, Tasks redesign shipped).

---

## Self-Review

**Spec coverage:**
- Day strip + date filtering → Task 5 ✓
- Variant A (status segments, one at a time) → Task 5 ✓
- Night Watch as shift flag + filter chip (set at task setup) → Tasks 1, 4, 5 ✓
- Carry-over of unfinished, badged "From <date>" → Task 5 (carry query + badge) ✓
- Recurring tasks (pre-log schedules) → Tasks 1, 3, 4, 5 ✓
- Recurring = simple tick-done, status hidden → Task 4 (sheet), Task 5 (`isDone`/`inSegment`) ✓
- Boat-scoped RLS on new table → Task 1 ✓
- Notifications → explicitly deferred (not in scope) ✓

**Placeholder scan:** No TBDs; all code is complete. Migration, types, helpers, both components given in full.

**Type consistency:** `shift`/`is_recurring`/`recurrence_type`/`recurrence_start_date` consistent across migration ↔ types ↔ sheet ↔ page. `DisplayTask._occurrenceDone`, `_completionId`, `_carriedOver` used consistently. Query keys `['tasks_view', dateKey]`, `['tasks_dots']`, `['recurring_templates']` match between page reads and sheet invalidations. Helper names `toDateStr`/`buildDayStrip`/`occursOnDate`/`recurrenceLabel` consistent.

**Known follow-ups (out of scope, noted not built):** delete/skip UI for a single recurring occurrence (BlitzBooks has a RecurringDeleteSheet — ShipShape currently deletes the whole series via the edit sheet); notifications on task-done; the "carried over" items currently fold into the To do/Doing segments by status rather than a separate section (matches the chosen Variant A sketch).
```

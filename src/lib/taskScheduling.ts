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

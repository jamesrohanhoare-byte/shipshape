import type { TimeLog } from '@/types'

// MLC 2006 / STCW rest-hour limits (the two headline ones):
//   • ≥ 10h rest in any 24h  →  ≤ 14h work per day
//   • ≥ 77h rest in any 7 days → ≤ 91h work per week
// v1 approximates the 24h window with calendar days and the 7-day window with
// the selected period total. (Rolling-window + the split-period rule are a
// future refinement.)
export const MLC_MAX_WORK_PER_DAY = 14
export const MLC_MAX_WORK_PER_WEEK = 91

export interface RestSummary {
  workHours: number
  sleepHours: number
  perDay: { date: string; work: number; breach: boolean }[]
  breaches: string[]
  compliant: boolean
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Local yyyy-MM-dd for a timestamp. */
function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Summarise one crew member's logs over a window (already filtered to that window). */
export function summarise(logs: TimeLog[], windowDays: number): RestSummary {
  const work = logs.filter(l => l.kind === 'work')
  const sleep = logs.filter(l => l.kind === 'sleep')
  const workHours = round1(work.reduce((s, l) => s + Number(l.hours), 0))
  const sleepHours = round1(sleep.reduce((s, l) => s + Number(l.hours), 0))

  const perDayMap = new Map<string, number>()
  for (const l of work) perDayMap.set(dayKey(l.started_at), (perDayMap.get(dayKey(l.started_at)) ?? 0) + Number(l.hours))
  const perDay = [...perDayMap.entries()]
    .map(([date, w]) => ({ date, work: round1(w), breach: w > MLC_MAX_WORK_PER_DAY }))
    .sort((a, b) => b.date.localeCompare(a.date))

  const breaches: string[] = []
  for (const d of perDay) {
    if (d.breach) breaches.push(`${d.date}: ${d.work}h worked — under 10h rest`)
  }
  if (windowDays >= 7 && workHours > MLC_MAX_WORK_PER_WEEK) {
    breaches.push(`${workHours}h worked in ${windowDays} days — over the 91h limit`)
  }

  return { workHours, sleepHours, perDay, breaches, compliant: breaches.length === 0 }
}

/** Hours between two ISO timestamps, rounded to 1 dp. */
export function hoursBetweenISO(startISO: string, endISO: string): number {
  const ms = new Date(endISO).getTime() - new Date(startISO).getTime()
  return round1(Math.max(0, ms / 3_600_000))
}

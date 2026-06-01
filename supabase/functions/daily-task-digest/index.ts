// Supabase Edge Function: daily-task-digest
// Triggered once a day by pg_cron (NOT by users). Runs with the service role,
// loops boats one at a time, and sends each boat a push listing ITS OWN tasks
// due today — targeted by that boat's boat_id tag, so no boat ever sees
// another boat's tasks. Protected by a shared x-cron-secret header.
import { createClient } from 'jsr:@supabase/supabase-js@2'

interface TaskRow {
  id: string
  boat_id: string
  is_recurring: boolean
  status: string
  due_date: string | null
  recurrence_type: string | null
  recurrence_start_date: string | null
}

function occursToday(t: TaskRow, today: Date): boolean {
  if (!t.is_recurring || !t.recurrence_start_date) return false
  const start = new Date(t.recurrence_start_date + 'T00:00:00Z')
  if (today < start) return false
  switch (t.recurrence_type) {
    case 'daily': return true
    case 'weekly': return today.getUTCDay() === start.getUTCDay()
    case 'monthly': return today.getUTCDate() === start.getUTCDate()
    default: return false
  }
}

Deno.serve(async (req) => {
  try {
    const secret = Deno.env.get('CRON_SECRET')
    if (secret && req.headers.get('x-cron-secret') !== secret) {
      return json({ ok: false, error: 'Forbidden' }, 403)
    }

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const appId = Deno.env.get('ONESIGNAL_APP_ID')
    const restKey = Deno.env.get('ONESIGNAL_REST_API_KEY')
    if (!appId || !restKey) return json({ ok: false, error: 'OneSignal keys not set' })
    const authHeader = restKey.startsWith('os_v2_') ? `Key ${restKey}` : `Basic ${restKey}`
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

    const todayKey = new Date().toISOString().slice(0, 10)
    const today = new Date(todayKey + 'T00:00:00Z')

    const { data: boats } = await admin.from('boats').select('id, name')
    const summary: { boat: string; due: number }[] = []

    for (const boat of boats ?? []) {
      // One-off tasks due today, not done.
      const { data: oneOff } = await admin
        .from('tasks').select('id')
        .eq('boat_id', boat.id).eq('is_recurring', false).eq('due_date', todayKey).neq('status', 'done')

      // Recurring templates that occur today, minus ones already done/skipped today.
      const { data: recurring } = await admin
        .from('tasks').select('id, boat_id, is_recurring, status, due_date, recurrence_type, recurrence_start_date')
        .eq('boat_id', boat.id).eq('is_recurring', true).lte('recurrence_start_date', todayKey)
      const dueRecurring = (recurring ?? []).filter(t => occursToday(t as TaskRow, today))
      let recurringDue = 0
      if (dueRecurring.length) {
        const { data: comps } = await admin
          .from('task_completions').select('task_id, done, skipped')
          .in('task_id', dueRecurring.map(t => t.id)).eq('occurrence_date', todayKey)
        recurringDue = dueRecurring.filter(t => {
          const c = (comps ?? []).find(x => x.task_id === t.id)
          return !c || (!c.done && !c.skipped)
        }).length
      }

      const due = (oneOff?.length ?? 0) + recurringDue
      summary.push({ boat: boat.name, due })
      if (due === 0) continue

      // Boat-scoped send to captain + manager (one per role).
      for (const role of ['captain', 'manager']) {
        await fetch('https://api.onesignal.com/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authHeader },
          body: JSON.stringify({
            app_id: appId,
            headings: { en: '⚓ Tasks due today' },
            contents: { en: `${due} task${due === 1 ? '' : 's'} due today on ${boat.name}.` },
            filters: [
              { field: 'tag', key: 'boat_id', relation: '=', value: boat.id },
              { operator: 'AND' },
              { field: 'tag', key: 'role', relation: '=', value: role },
            ],
          }),
        })
      }
    }

    return json({ ok: true, date: todayKey, summary })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  })
}

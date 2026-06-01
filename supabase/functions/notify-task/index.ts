// Supabase Edge Function: notify-task
// Boat-scoped task notifications. Verifies the caller's boat from the JWT and
// only ever targets devices tagged with THAT boat_id — a boat never receives
// another boat's task pushes.
//   { event: 'completed', task_id } → tells captain+manager a task was finished
//   { event: 'assigned',  task_id } → tells the assignee they got a new task
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    if (!jwt) return json({ ok: false, error: 'Missing auth' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const appId = Deno.env.get('ONESIGNAL_APP_ID')
    const restKey = Deno.env.get('ONESIGNAL_REST_API_KEY')
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

    const { data: userData } = await admin.auth.getUser(jwt)
    if (!userData?.user) return json({ ok: false, error: 'Invalid token' }, 401)
    const callerId = userData.user.id
    const { data: caller } = await admin
      .from('profiles').select('boat_id, full_name').eq('id', callerId).single()
    if (!caller) return json({ ok: false, error: 'No profile' }, 403)

    if (!appId || !restKey) return json({ ok: false, error: 'OneSignal keys not set' })
    const authHeader = restKey.startsWith('os_v2_') ? `Key ${restKey}` : `Basic ${restKey}`

    const body = await req.json().catch(() => ({}))
    const event = String(body.event ?? '')
    const taskId = String(body.task_id ?? '')
    if (!taskId) return json({ ok: false, error: 'task_id required' }, 400)

    // Load the task and HARD-CHECK it belongs to the caller's boat (isolation).
    const { data: task } = await admin
      .from('tasks').select('id, title, boat_id, assigned_to, due_date').eq('id', taskId).single()
    if (!task) return json({ ok: false, error: 'Task not found' }, 404)
    if (task.boat_id !== caller.boat_id) return json({ ok: false, error: 'Wrong boat' }, 403)

    const who = (caller as { full_name?: string }).full_name || 'A crew member'

    // Send to captain+manager of THIS boat (one targeted send per role).
    async function sendToRoles(heading: string, message: string) {
      const results: unknown[] = []
      for (const role of ['captain', 'manager']) {
        const r = await fetch('https://api.onesignal.com/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authHeader },
          body: JSON.stringify({
            app_id: appId,
            headings: { en: heading },
            contents: { en: message },
            filters: [
              { field: 'tag', key: 'boat_id', relation: '=', value: caller!.boat_id },
              { operator: 'AND' },
              { field: 'tag', key: 'role', relation: '=', value: role },
            ],
          }),
        })
        results.push({ role, status: r.status, body: await r.json() })
      }
      return results
    }

    // Send to one specific user (the assignee), by their external id (= profile id).
    async function sendToUser(userId: string, heading: string, message: string) {
      const r = await fetch('https://api.onesignal.com/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({
          app_id: appId,
          target_channel: 'push',
          include_aliases: { external_id: [userId] },
          headings: { en: heading },
          contents: { en: message },
        }),
      })
      return [{ user: userId, status: r.status, body: await r.json() }]
    }

    if (event === 'completed') {
      const results = await sendToRoles('✅ Task done', `${who} completed “${task.title}”.`)
      return json({ ok: true, results })
    }

    if (event === 'assigned') {
      if (!task.assigned_to) return json({ ok: true, skipped: 'no assignee' })
      if (task.assigned_to === callerId) return json({ ok: true, skipped: 'self-assigned' })
      const today = new Date().toISOString().slice(0, 10)
      const dueTxt = task.due_date === today ? ' — due today' : ''
      const results = await sendToUser(task.assigned_to, '📋 New task', `${who} assigned you “${task.title}”${dueTxt}.`)
      return json({ ok: true, results })
    }

    return json({ ok: false, error: 'Unknown event' }, 400)
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

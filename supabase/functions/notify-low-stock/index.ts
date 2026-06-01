// Supabase Edge Function: notify-low-stock
// Sends a OneSignal push to the captain(s) + manager(s) of a boat.
// - Normal: called after a deduction; respects boats.notify_mode (all|low|off),
//   escalates the message when stock crosses par.
// - Test mode ({ test: true }): sends a "Test alert" and returns OneSignal's raw
//   response so the Settings button can show exactly what happened.
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
    const { data: caller } = await admin
      .from('profiles').select('boat_id, full_name').eq('id', userData.user.id).single()
    if (!caller) return json({ ok: false, error: 'No profile' }, 403)

    if (!appId || !restKey) {
      return json({ ok: false, error: 'OneSignal keys are not set on the server' })
    }
    const authHeader = restKey.startsWith('os_v2_') ? `Key ${restKey}` : `Basic ${restKey}`

    // Send one targeted push per role (boat_id AND role). Separate sends because
    // OneSignal evaluates filters left-to-right with no grouping.
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

    const body = await req.json().catch(() => ({}))

    // ── Test mode ──────────────────────────────────────────────
    if (body.test === true) {
      const results = await sendToRoles('Test alert ✅', 'Notifications are working on this boat.')
      return json({ ok: true, test: true, results })
    }

    // ── Normal usage notification ──────────────────────────────
    const itemId = String(body.item_id ?? '')
    const usedQty = Number(body.used_qty ?? 0)
    if (!itemId) return json({ ok: false, error: 'item_id required' }, 400)

    const { data: item } = await admin
      .from('items')
      .select('name, current_quantity, par_level, boat_id, units(abbreviation)')
      .eq('id', itemId).eq('boat_id', caller.boat_id).single()
    if (!item) return json({ ok: false, error: 'Item not found' }, 404)

    const unit = (item as { units?: { abbreviation?: string } }).units?.abbreviation ?? ''
    const qty = Number(item.current_quantity)
    const par = Number(item.par_level)
    const low = qty <= par

    const { data: boatRow } = await admin.from('boats').select('notify_mode').eq('id', caller.boat_id).single()
    const mode = (boatRow as { notify_mode?: string } | null)?.notify_mode ?? 'all'
    if (mode === 'off') return json({ ok: true, skipped: 'notifications off' })
    if (mode === 'low' && !low) return json({ ok: true, skipped: 'low-only mode, above par' })

    const who = (caller as { full_name?: string }).full_name || 'A crew member'
    const usedTxt = usedQty > 0 ? `${who} used ${usedQty} ${unit}`.trim() : `${who} logged usage`
    let heading = 'Stock used'
    let tail = `${qty} ${unit} left`.trim()
    if (qty <= 0) { heading = '❗ Out of stock'; tail = `${item.name} is finished — on the shopping list` }
    else if (qty <= par) { heading = '⚠️ Now low'; tail = `${qty} ${unit} left — added to shopping list`.trim() }

    const results = await sendToRoles(heading, `${item.name}: ${usedTxt}. ${tail}.`)
    return json({ ok: true, results })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

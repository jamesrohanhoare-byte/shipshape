// Supabase Edge Function: notify-low-stock
// Sends a OneSignal push to the captain(s) + manager(s) of a boat when an item
// crosses its par level. Called by the client right after a deduct that crosses par.
// The OneSignal REST key stays server-side here.
// Deploy: supabase functions deploy notify-low-stock
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace('Bearer ', '')
    if (!jwt) return json({ error: 'Missing auth' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const appId = Deno.env.get('ONESIGNAL_APP_ID')
    const restKey = Deno.env.get('ONESIGNAL_REST_API_KEY')

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

    // Verify caller and derive their boat (never trust a client-supplied boat_id)
    const { data: userData } = await admin.auth.getUser(jwt)
    if (!userData?.user) return json({ error: 'Invalid token' }, 401)
    const { data: caller } = await admin
      .from('profiles').select('boat_id').eq('id', userData.user.id).single()
    if (!caller) return json({ error: 'No profile' }, 403)

    const body = await req.json()
    const itemId = String(body.item_id ?? '')
    if (!itemId) return json({ error: 'item_id required' }, 400)

    // Confirm the item belongs to the caller's boat and is actually at/below par
    const { data: item } = await admin
      .from('items')
      .select('name, current_quantity, par_level, boat_id, units(abbreviation)')
      .eq('id', itemId).eq('boat_id', caller.boat_id).single()
    if (!item) return json({ error: 'Item not found' }, 404)
    if (Number(item.current_quantity) > Number(item.par_level)) {
      return json({ ok: true, skipped: 'above par' })
    }

    if (!appId || !restKey) {
      // Push not configured — succeed quietly so the app flow isn't blocked
      return json({ ok: true, skipped: 'push not configured' })
    }

    const unit = (item as { units?: { abbreviation?: string } }).units?.abbreviation ?? ''
    const qty = Number(item.current_quantity)
    const message = `${item.name} is low — ${qty} ${unit} left (par ${item.par_level})`

    // New-format keys (os_v2_...) use `Key` auth on api.onesignal.com; legacy
    // keys use `Basic`. Auto-detect so either works.
    const authHeader = restKey.startsWith('os_v2_') ? `Key ${restKey}` : `Basic ${restKey}`

    // One targeted send per role. Each filter is (boat_id AND role) — kept as
    // separate requests because OneSignal evaluates filters left-to-right with no
    // grouping, so a combined OR would leak to other boats.
    const statuses: number[] = []
    for (const role of ['captain', 'manager']) {
      const r = await fetch('https://api.onesignal.com/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({
          app_id: appId,
          headings: { en: 'Low stock' },
          contents: { en: message },
          filters: [
            { field: 'tag', key: 'boat_id', relation: '=', value: caller.boat_id },
            { operator: 'AND' },
            { field: 'tag', key: 'role', relation: '=', value: role },
          ],
        }),
      })
      statuses.push(r.status)
    }

    return json({ ok: true, statuses })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

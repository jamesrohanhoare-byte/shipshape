// Supabase Edge Function: create-crew-member
// Captain-only. Creates an auth user (service role) + their profile, scoped to
// the captain's boat. Deploy: supabase functions deploy create-crew-member
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ALLOWED_ROLES = ['manager', 'deckhand', 'engineer', 'captain']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace('Bearer ', '')
    if (!jwt) return json({ error: 'Missing auth' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

    // Identify the caller and verify they are a captain
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userData.user) return json({ error: 'Invalid token' }, 401)

    const { data: caller, error: callerErr } = await admin
      .from('profiles').select('boat_id, role').eq('id', userData.user.id).single()
    if (callerErr || !caller) return json({ error: 'No profile' }, 403)
    if (caller.role !== 'captain') return json({ error: 'Only the captain can add crew' }, 403)

    const body = await req.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const full_name = String(body.full_name ?? '').trim()
    const role = String(body.role ?? 'deckhand')

    if (!email || !password) return json({ error: 'Email and password are required' }, 400)
    if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400)
    if (!ALLOWED_ROLES.includes(role)) return json({ error: 'Invalid role' }, 400)

    // Create the auth user (email pre-confirmed — crew log in immediately)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name },
    })
    if (createErr || !created.user) return json({ error: createErr?.message ?? 'Could not create user' }, 400)

    const { error: profErr } = await admin.from('profiles').insert({
      id: created.user.id,
      boat_id: caller.boat_id,
      email,
      full_name: full_name || email,
      role,
    })
    if (profErr) {
      // Roll back the orphaned auth user if the profile insert fails
      await admin.auth.admin.deleteUser(created.user.id)
      return json({ error: profErr.message }, 400)
    }

    return json({ ok: true, id: created.user.id })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

import { supabase } from './supabase'
import type { Role } from '@/types'

/** Invoke the secure crew-creation edge function (captain only). */
export async function createCrewMember(input: {
  email: string
  password: string
  full_name: string
  role: Role
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke('create-crew-member', { body: input })
  if (error) {
    // Surface the function's JSON error message when present
    const msg = (data as { error?: string } | null)?.error
    throw new Error(msg || error.message)
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
}

/** Fire a usage push to captain/manager (best-effort; never blocks the UI flow).
 *  Sends on every deduction; the function escalates the message when it crosses par. */
export async function notifyUsage(itemId: string, usedQty: number): Promise<void> {
  try {
    await supabase.functions.invoke('notify-low-stock', { body: { item_id: itemId, used_qty: usedQty } })
  } catch (err) {
    console.warn('usage push failed (non-blocking):', err)
  }
}

interface TestResult { ok: boolean; detail: string }
interface OneSignalResult { body?: { recipients?: number; errors?: unknown } }

/** Send a test push and report exactly what happened (diagnostic + Settings feature). */
export async function sendTestAlert(): Promise<TestResult> {
  const { data, error } = await supabase.functions.invoke('notify-low-stock', { body: { test: true } })
  if (error) {
    const msg = (data as { error?: string } | null)?.error
    return { ok: false, detail: msg || error.message }
  }
  const d = data as { ok?: boolean; error?: string; results?: OneSignalResult[] }
  if (!d?.ok) return { ok: false, detail: d?.error ?? 'Unknown error' }
  const recipients = (d.results ?? []).reduce((sum, r) => sum + (r.body?.recipients ?? 0), 0)
  return recipients > 0
    ? { ok: true, detail: `Sent to ${recipients} device${recipients === 1 ? '' : 's'} ✅` }
    : { ok: false, detail: 'Reached OneSignal, but 0 devices matched. Enable notifications on a device (and make sure it stays subscribed) first.' }
}

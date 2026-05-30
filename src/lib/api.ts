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

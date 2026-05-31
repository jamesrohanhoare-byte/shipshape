import type { Role } from '@/types'

/**
 * Single source of truth for the role matrix used by UI gating.
 * RLS at the database enforces the same rules server-side — this is the
 * client mirror so we hide what a role can't do.
 *
 *   Captain  — full control of the boat
 *   Manager  — manage stock + items + boat config, no crew admin
 *   Deckhand — deduct stock (log usage) + own sleep, read-only elsewhere
 *   Engineer — deduct stock + own tasks + own sleep
 */

export const ROLE_LABELS: Record<Role, string> = {
  captain: 'Captain',
  manager: 'Manager',
  deckhand: 'Deckhand',
  engineer: 'Engineer',
}

/** Add stock, edit/create/delete items, manage units & categories. */
export function canManageStock(role: Role): boolean {
  return role === 'captain' || role === 'manager'
}

/** Deduct stock / log usage — everyone can. */
export function canDeductStock(): boolean {
  return true
}

/** Create/edit crew, assign roles. Captain only. */
export function canManageCrew(role: Role): boolean {
  return role === 'captain'
}

/** Edit boat settings: branding, units, categories. */
export function canEditBoatSettings(role: Role): boolean {
  return role === 'captain' || role === 'manager'
}

/** Create/edit/assign tasks. */
export function canManageTasks(role: Role): boolean {
  return role === 'captain' || role === 'manager' || role === 'engineer'
}

/** View usage & cost reports. */
export function canViewReports(role: Role): boolean {
  return role === 'captain' || role === 'manager'
}

/** Receive low-stock push notifications. */
export function receivesLowStockAlerts(role: Role): boolean {
  return role === 'captain' || role === 'manager'
}

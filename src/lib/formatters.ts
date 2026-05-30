import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns'

export function formatZAR(n: number | null | undefined, opts?: { compact?: boolean }): string {
  const num = Number(n || 0)
  if (opts?.compact && Math.abs(num) >= 1000) {
    return `R${(num / 1000).toFixed(1)}k`
  }
  return `R${num.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Quantities: trim trailing zeros but allow up to 2 decimals (e.g. 1.5 L, 12 each). */
export function formatQty(n: number | null | undefined): string {
  const num = Number(n || 0)
  return num.toLocaleString('en-ZA', { maximumFractionDigits: 2 })
}

export function formatDate(d: string | null | undefined, fmt = 'd MMM yyyy'): string {
  if (!d) return '—'
  try {
    const parsed = parseISO(d)
    return isValid(parsed) ? format(parsed, fmt) : '—'
  } catch {
    return '—'
  }
}

export function formatRelative(d: string | null | undefined): string {
  if (!d) return ''
  try {
    return formatDistanceToNow(parseISO(d), { addSuffix: true })
  } catch {
    return ''
  }
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

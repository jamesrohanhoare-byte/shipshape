import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns'

/** Currency-aware money formatter. Currency is chosen per-boat (see useMoney). */
export function formatMoney(n: number | null | undefined, currency = 'ZAR', opts?: { compact?: boolean }): string {
  const num = Number(n || 0)
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      ...(opts?.compact
        ? { notation: 'compact', maximumFractionDigits: 1 }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    }).format(num)
  } catch {
    // Unknown currency code — fall back to a plain prefixed amount.
    return `${currency} ${num.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
}

/** @deprecated Use useMoney() so the boat's chosen currency is respected. */
export function formatZAR(n: number | null | undefined, opts?: { compact?: boolean }): string {
  return formatMoney(n, 'ZAR', opts)
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

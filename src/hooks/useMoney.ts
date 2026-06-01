import { useAuth } from '@/context/AuthContext'
import { formatMoney } from '@/lib/formatters'

/** Returns a money formatter bound to the current boat's chosen currency. */
export function useMoney() {
  const { boat } = useAuth()
  const currency = boat?.currency || 'ZAR'
  return (n: number | null | undefined, opts?: { compact?: boolean }) => formatMoney(n, currency, opts)
}

/** Whether to show financial figures on crew-facing surfaces (dashboard, shopping). Defaults true. */
export function useShowFinancials(): boolean {
  const { boat } = useAuth()
  return boat?.show_financials !== false
}

/** Common currencies for yacht operations. */
export const CURRENCIES: { code: string; label: string }[] = [
  { code: 'ZAR', label: 'R · South African Rand' },
  { code: 'USD', label: '$ · US Dollar' },
  { code: 'EUR', label: '€ · Euro' },
  { code: 'GBP', label: '£ · British Pound' },
  { code: 'AUD', label: 'A$ · Australian Dollar' },
  { code: 'AED', label: 'د.إ · UAE Dirham' },
  { code: 'CHF', label: 'CHF · Swiss Franc' },
  { code: 'CAD', label: 'C$ · Canadian Dollar' },
]

import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, TrendingDown, Anchor } from 'lucide-react'
import { BarChart, Bar, ResponsiveContainer, Cell, XAxis, Tooltip } from 'recharts'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { canViewReports } from '@/lib/permissions'
import { formatZAR, formatQty } from '@/lib/formatters'

type Interval = 'today' | '7d' | '30d'
const INTERVALS: { v: Interval; label: string; days: number }[] = [
  { v: 'today', label: 'Today', days: 1 },
  { v: '7d', label: 'This week', days: 7 },
  { v: '30d', label: 'This month', days: 30 },
]

interface DeductRow {
  change_qty: number
  item: { name: string; price_per_unit: number; category: { name: string } | null } | null
}

export default function Reports() {
  const { profile, boat } = useAuth()
  const [interval, setInterval] = useState<Interval>('7d')

  const days = INTERVALS.find(i => i.v === interval)!.days
  const fromISO = useMemo(() => {
    const d = new Date()
    if (days === 1) d.setHours(0, 0, 0, 0)
    else d.setDate(d.getDate() - days)
    return d.toISOString()
  }, [days])

  const { data: rows = [], isLoading } = useQuery<DeductRow[]>({
    queryKey: ['report-deducts', interval],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('change_qty, item:items(name, price_per_unit, category:categories(name))')
        .eq('type', 'deduct')
        .gte('created_at', fromISO)
      if (error) throw error
      return (data ?? []) as unknown as DeductRow[]
    },
  })

  const { byItem, byCategory, totalCost, totalUnits } = useMemo(() => {
    const items = new Map<string, { name: string; qty: number; cost: number }>()
    const cats = new Map<string, number>()
    let totalCost = 0, totalUnits = 0
    for (const r of rows) {
      if (!r.item) continue
      const qty = Math.abs(Number(r.change_qty))
      const cost = qty * Number(r.item.price_per_unit)
      totalCost += cost; totalUnits += qty
      const cur = items.get(r.item.name) ?? { name: r.item.name, qty: 0, cost: 0 }
      cur.qty += qty; cur.cost += cost
      items.set(r.item.name, cur)
      const cat = r.item.category?.name ?? 'Uncategorised'
      cats.set(cat, (cats.get(cat) ?? 0) + cost)
    }
    return {
      byItem: [...items.values()].sort((a, b) => b.cost - a.cost),
      byCategory: [...cats.entries()].map(([name, cost]) => ({ name, cost })).sort((a, b) => b.cost - a.cost),
      totalCost, totalUnits,
    }
  }, [rows])

  if (profile && !canViewReports(profile.role)) return <Navigate to="/" replace />

  const chartData = byItem.slice(0, 7).map(i => ({ name: i.name.length > 10 ? i.name.slice(0, 9) + '…' : i.name, cost: Math.round(i.cost) }))

  return (
    <>
      <PageHeader title="Reports" subtitle="Usage & cost" />

      <div style={{ padding: '4px 16px 8px' }}>
        <div className="segmented">
          {INTERVALS.map(i => <button key={i.v} data-active={interval === i.v} onClick={() => setInterval(i.v)}>{i.label}</button>)}
        </div>
      </div>

      {/* Summary */}
      <div style={{ padding: '4px 16px' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: boat?.logo_url ? `center/cover no-repeat url(${boat.logo_url})` : 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {!boat?.logo_url && <Anchor size={18} color="#fff" />}
            </div>
            <div>
              <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>Consumed · {INTERVALS.find(i => i.v === interval)!.label.toLowerCase()}</div>
              <div className="tabnum" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em' }}>{formatZAR(totalCost)}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="tabnum" style={{ fontSize: 20, fontWeight: 700 }}>{formatQty(totalUnits)}</div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>units used</div>
          </div>
        </div>

        {isLoading ? (
          <div className="skeleton" style={{ height: 180, borderRadius: 16 }} />
        ) : byItem.length === 0 ? (
          <EmptyState icon={TrendingDown} title="No usage yet" message="Log some stock usage and your consumption report will appear here." />
        ) : (
          <>
            {/* Chart */}
            <div className="card" style={{ marginBottom: 14, paddingBottom: 8 }}>
              <div className="section-header" style={{ margin: '0 0 10px', padding: 0 }}>Top items by cost (R)</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }} axisLine={false} tickLine={false} interval={0} />
                  <Tooltip
                    cursor={{ fill: 'var(--color-accent-dim)' }}
                    contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, fontSize: 13 }}
                    formatter={(v) => [formatZAR(Number(v)), 'Cost']}
                  />
                  <Bar dataKey="cost" radius={[7, 7, 0, 0]}>
                    {chartData.map((_, i) => <Cell key={i} fill="var(--color-accent)" opacity={1 - i * 0.1} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* By item table */}
            <div className="section-header" style={{ paddingLeft: 4 }}>Usage by item</div>
            <div className="list-group">
              {byItem.map(i => (
                <div key={i.name} className="list-row" style={{ cursor: 'default' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>{formatQty(i.qty)} used</div>
                  </div>
                  <div className="amount" style={{ fontWeight: 700 }}>{formatZAR(i.cost)}</div>
                </div>
              ))}
            </div>

            {/* By category */}
            {byCategory.length > 1 && (
              <>
                <div className="section-header" style={{ paddingLeft: 4 }}>By category</div>
                <div className="list-group" style={{ marginBottom: 12 }}>
                  {byCategory.map(c => (
                    <div key={c.name} className="list-row" style={{ cursor: 'default' }}>
                      <BarChart3 size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                      <div style={{ flex: 1, fontWeight: 600 }}>{c.name}</div>
                      <div className="amount" style={{ fontWeight: 700 }}>{formatZAR(c.cost)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}

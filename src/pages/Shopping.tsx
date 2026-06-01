import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ShoppingCart, CheckCircle2, Share2, X } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import QuantitySheet from '@/components/QuantitySheet'
import { supabase } from '@/lib/supabase'
import { useItems, stockStatus } from '@/hooks/useInventory'
import { useAuth } from '@/context/AuthContext'
import { canManageStock } from '@/lib/permissions'
import { formatQty } from '@/lib/formatters'
import { useMoney, useShowFinancials } from '@/hooks/useMoney'
import type { Item } from '@/types'

function suggestedQty(item: Item): number {
  return Math.max(0, Number(item.par_level) - Number(item.current_quantity))
}

export default function Shopping() {
  const { profile, boat } = useAuth()
  const canManage = profile ? canManageStock(profile.role) : false
  const money = useMoney()
  const showFinancials = useShowFinancials()
  const qc = useQueryClient()
  const { data: items = [], isLoading } = useItems()
  const [selected, setSelected] = useState<Item | null>(null)

  async function dismiss(item: Item) {
    qc.setQueryData<Item[]>(['items'], prev => prev?.map(i => i.id === item.id ? { ...i, shopping_dismissed: true } : i))
    const { error } = await supabase.from('items').update({ shopping_dismissed: true }).eq('id', item.id)
    if (error) qc.invalidateQueries({ queryKey: ['items'] })
  }

  const list = useMemo(() => {
    return items
      .filter(i => stockStatus(i) !== 'ok' && !i.shopping_dismissed)
      .sort((a, b) => {
        const order = { out: 0, low: 1, ok: 2 }
        return order[stockStatus(a)] - order[stockStatus(b)] || a.name.localeCompare(b.name)
      })
  }, [items])

  const totalCost = useMemo(
    () => list.reduce((sum, i) => sum + suggestedQty(i) * Number(i.price_per_unit), 0),
    [list]
  )

  // Group by where to buy it, so a provisioning run is organised by store.
  const hasPurchaseInfo = useMemo(() => list.some(i => i.purchase_location?.trim()), [list])
  const groups = useMemo(() => {
    const map = new Map<string, Item[]>()
    for (const i of list) {
      const key = i.purchase_location?.trim() || 'Other'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(i)
    }
    return [...map.entries()].sort((a, b) =>
      a[0] === 'Other' ? 1 : b[0] === 'Other' ? -1 : a[0].localeCompare(b[0])
    )
  }, [list])

  function share() {
    const fmtItem = (i: Item) => `• ${i.name} — ${formatQty(suggestedQty(i))} ${i.unit?.abbreviation ?? ''}`.trim()
    const body = hasPurchaseInfo
      ? groups.map(([store, items]) => `${store}\n${items.map(fmtItem).join('\n')}`).join('\n\n')
      : list.map(fmtItem).join('\n')
    const text = `${boat?.name ?? 'Boat'} — Shopping list\n\n${body}${showFinancials ? `\n\nEst. ${money(totalCost)}` : ''}`
    if (navigator.share) navigator.share({ title: 'Shopping list', text }).catch(() => {})
    else { navigator.clipboard?.writeText(text); alert('Shopping list copied to clipboard') }
  }

  const renderRow = (item: Item) => {
    const s = stockStatus(item)
    const qty = suggestedQty(item)
    const unit = item.unit?.abbreviation ?? ''
    return (
      <div key={item.id} className="list-row" onClick={() => canManage && setSelected(item)} style={{ cursor: canManage ? 'pointer' : 'default' }}>
        <div style={{ width: 8, height: 8, borderRadius: 4, background: s === 'out' ? 'var(--color-danger)' : 'var(--color-warning)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
            {formatQty(item.current_quantity)} on hand · buy ~{formatQty(qty)} {unit}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {showFinancials && <div className="amount" style={{ fontSize: 15, fontWeight: 700 }}>{money(qty * Number(item.price_per_unit))}</div>}
          {canManage && <div style={{ fontSize: 12, color: 'var(--color-accent)', fontWeight: 600, marginTop: 1 }}>Restock</div>}
        </div>
        {canManage && (
          <button
            onClick={e => { e.stopPropagation(); dismiss(item) }}
            aria-label="Remove from shopping list"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-faint)', padding: 6, flexShrink: 0, marginLeft: 2 }}
          >
            <X size={16} />
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Shopping"
        subtitle={list.length ? `${list.length} item${list.length === 1 ? '' : 's'} to buy` : 'Auto-built from par levels'}
        action={list.length > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={share}><Share2 size={16} /> Share</button>
        )}
      />

      {isLoading ? (
        <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 14 }} />)}
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="All stocked up" message="Nothing is below its par level. This list fills automatically as stock runs low." />
      ) : (
        <div style={{ padding: '4px 16px' }}>
          {/* Total card */}
          {showFinancials && (
            <div className="card" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Estimated to restock to par</div>
                <div className="tabnum" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>{money(totalCost)}</div>
              </div>
              <div style={{ width: 46, height: 46, borderRadius: 13, background: 'var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShoppingCart size={22} style={{ color: 'var(--color-accent)' }} />
              </div>
            </div>
          )}

          {hasPurchaseInfo ? (
            groups.map(([store, storeItems]) => (
              <div key={store}>
                <div className="section-header" style={{ paddingLeft: 4 }}>{store}</div>
                <div className="list-group">{storeItems.map(renderRow)}</div>
              </div>
            ))
          ) : (
            <div className="list-group">{list.map(renderRow)}</div>
          )}
          <p style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: '14px 20px' }}>
            {canManage ? 'Tap an item to log a restock. It clears once back above par.' : 'Items here are below par. Your manager handles restocking.'}
          </p>
        </div>
      )}

      <QuantitySheet open={!!selected} onClose={() => setSelected(null)} item={selected} />
    </>
  )
}

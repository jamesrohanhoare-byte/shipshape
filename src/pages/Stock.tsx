import { useMemo, useState } from 'react'
import { Plus, Search, Package, Pencil, MapPin } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import QuantitySheet from '@/components/QuantitySheet'
import ItemFormSheet from '@/components/ItemFormSheet'
import { useItems, stockStatus } from '@/hooks/useInventory'
import { useAuth } from '@/context/AuthContext'
import { canManageStock } from '@/lib/permissions'
import { formatQty } from '@/lib/formatters'
import type { Item } from '@/types'

type Filter = 'all' | 'low' | 'out'
const STATUS_BADGE = { ok: 'badge-ok', low: 'badge-low', out: 'badge-out' } as const
const STATUS_LABEL = { ok: 'OK', low: 'Low', out: 'Out' } as const

export default function Stock() {
  const { profile } = useAuth()
  const canManage = profile ? canManageStock(profile.role) : false
  const { data: items = [], isLoading } = useItems()

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Item | null>(null)
  const [editing, setEditing] = useState<Item | null>(null)
  const [creating, setCreating] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(i => {
      if (q && !i.name.toLowerCase().includes(q)) return false
      const s = stockStatus(i)
      if (filter === 'low') return s === 'low'
      if (filter === 'out') return s === 'out'
      return true
    })
  }, [items, search, filter])

  // Group by category name
  const groups = useMemo(() => {
    const map = new Map<string, Item[]>()
    for (const it of filtered) {
      const key = it.category?.name ?? 'Uncategorised'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(it)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  return (
    <>
      <PageHeader
        title="Stock"
        subtitle={`${items.length} item${items.length === 1 ? '' : 's'}`}
        action={canManage && (
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            <Plus size={17} /> Add
          </button>
        )}
      />

      <div style={{ padding: '4px 16px 0' }}>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={17} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
          <input className="input" style={{ paddingLeft: 40 }} placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="segmented" style={{ marginBottom: 8 }}>
          <button data-active={filter === 'all'} onClick={() => setFilter('all')}>All</button>
          <button data-active={filter === 'low'} onClick={() => setFilter('low')}>Low</button>
          <button data-active={filter === 'out'} onClick={() => setFilter('out')}>Out</button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 14 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title={items.length === 0 ? 'No stock yet' : 'Nothing matches'}
          message={items.length === 0 ? (canManage ? 'Add your first item to start tracking.' : 'The manager hasn’t added items yet.') : 'Try a different search or filter.'}
          action={items.length === 0 && canManage && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18} /> Add item</button>}
        />
      ) : (
        <div style={{ padding: '4px 16px' }}>
          {groups.map(([cat, list]) => (
            <div key={cat}>
              <div className="section-header" style={{ paddingLeft: 4 }}>{cat}</div>
              <div className="list-group">
                {list.map(item => {
                  const s = stockStatus(item)
                  const unit = item.unit?.abbreviation ?? ''
                  return (
                    <div key={item.id} className="list-row" onClick={() => setSelected(item)} style={{ cursor: 'pointer' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
                          {item.location && <><MapPin size={12} /> {item.location} · </>}
                          par {formatQty(item.par_level)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div className="tabnum" style={{ fontSize: 17, fontWeight: 700 }}>{formatQty(item.current_quantity)}<span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontWeight: 500 }}> {unit}</span></div>
                        <span className={`badge ${STATUS_BADGE[s]}`} style={{ marginTop: 3, fontSize: 11, padding: '2px 8px' }}>{STATUS_LABEL[s]}</span>
                      </div>
                      {canManage && (
                        <button onClick={e => { e.stopPropagation(); setEditing(item) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-faint)', padding: 6, flexShrink: 0 }}>
                          <Pencil size={16} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <QuantitySheet open={!!selected} onClose={() => setSelected(null)} item={selected} />
      <ItemFormSheet open={creating} onClose={() => setCreating(false)} />
      <ItemFormSheet open={!!editing} onClose={() => setEditing(null)} item={editing} />
    </>
  )
}

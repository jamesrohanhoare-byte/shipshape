import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Anchor, TriangleAlert, Boxes, Wallet, ArrowDownRight, ArrowUpRight, ClipboardList } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useItems, stockStatus } from '@/hooks/useInventory'
import { useCrew } from '@/hooks/useCrew'
import { formatQty, formatRelative } from '@/lib/formatters'
import { useMoney, useShowFinancials } from '@/hooks/useMoney'
import type { StockMovement, Item } from '@/types'

interface MovementRow extends StockMovement { item?: Pick<Item, 'name'> | null }

export default function Home() {
  const navigate = useNavigate()
  const { profile, boat } = useAuth()
  const money = useMoney()
  const showFinancials = useShowFinancials()
  const { data: items = [] } = useItems()
  const { data: crew = [] } = useCrew()

  const { data: recent = [] } = useQuery<MovementRow[]>({
    queryKey: ['movements', 'recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('*, item:items(name)')
        .order('created_at', { ascending: false })
        .limit(8)
      if (error) throw error
      return (data ?? []) as MovementRow[]
    },
  })

  const lowItems = useMemo(() => items.filter(i => stockStatus(i) !== 'ok'), [items])
  const stockValue = useMemo(
    () => items.reduce((s, i) => s + Number(i.current_quantity) * Number(i.price_per_unit), 0),
    [items]
  )
  const crewName = (id: string | null) => crew.find(c => c.id === id)?.full_name ?? 'Crew'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div style={{ padding: '2px 16px' }}>
      {/* Boat header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 4px 18px' }}
      >
        <div style={{
          width: 50, height: 50, borderRadius: 14, flexShrink: 0,
          background: boat?.logo_url ? `center/cover no-repeat url(${boat.logo_url})` : 'var(--color-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {!boat?.logo_url && <Anchor size={24} color="#fff" strokeWidth={2.3} />}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, color: 'var(--color-text-secondary)' }}>{greeting}, {profile?.full_name?.split(' ')[0]}</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{boat?.name}</div>
        </div>
      </motion.div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <Tile
          onClick={() => navigate('/shopping')}
          accent={lowItems.length > 0}
          icon={TriangleAlert}
          value={String(lowItems.length)}
          label={lowItems.length === 1 ? 'item low' : 'items low'}
          tone={lowItems.length > 0 ? 'warn' : 'ok'}
        />
        <Tile onClick={() => navigate('/stock')} icon={Boxes} value={String(items.length)} label="items tracked" />
        {showFinancials && <Tile icon={Wallet} value={money(stockValue, { compact: true })} label="stock on hand" wide />}
      </div>

      {/* Running low preview */}
      {lowItems.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div className="section-header" style={{ paddingLeft: 4, display: 'flex', justifyContent: 'space-between' }}>
            <span>Running low</span>
            <span onClick={() => navigate('/shopping')} style={{ color: 'var(--color-accent)', cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>See all</span>
          </div>
          <div className="list-group">
            {lowItems.slice(0, 4).map(i => (
              <div key={i.id} className="list-row" onClick={() => navigate('/stock')}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: stockStatus(i) === 'out' ? 'var(--color-danger)' : 'var(--color-warning)' }} />
                <div style={{ flex: 1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}</div>
                <div className="tabnum" style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>{formatQty(i.current_quantity)} / {formatQty(i.par_level)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div className="section-header" style={{ paddingLeft: 4 }}>Recent activity</div>
      {recent.length === 0 ? (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--color-text-tertiary)' }}>
          <ClipboardList size={20} /> No stock movements yet.
        </div>
      ) : (
        <div className="list-group">
          {recent.map(m => {
            const isDeduct = m.change_qty < 0
            return (
              <div key={m.id} className="list-row" style={{ cursor: 'default' }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: isDeduct ? 'var(--color-danger-dim)' : 'var(--color-success-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isDeduct ? <ArrowDownRight size={16} style={{ color: 'var(--color-danger)' }} /> : <ArrowUpRight size={16} style={{ color: 'var(--color-success)' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.item?.name ?? 'Item'}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>{crewName(m.user_id)} · {formatRelative(m.created_at)}</div>
                </div>
                <div className="tabnum" style={{ fontWeight: 700, color: isDeduct ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  {isDeduct ? '' : '+'}{formatQty(m.change_qty)}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div style={{ height: 12 }} />
    </div>
  )
}

function Tile({ icon: Icon, value, label, onClick, wide, tone = 'default', accent }: {
  icon: typeof Boxes; value: string; label: string; onClick?: () => void; wide?: boolean; tone?: 'default' | 'warn' | 'ok'; accent?: boolean
}) {
  const color = tone === 'warn' ? 'var(--color-warning)' : tone === 'ok' ? 'var(--color-success)' : 'var(--color-accent)'
  return (
    <button
      onClick={onClick}
      className="card"
      style={{
        gridColumn: wide ? '1 / -1' : 'auto',
        textAlign: 'left', cursor: onClick ? 'pointer' : 'default', border: 'none',
        display: 'flex', alignItems: 'center', gap: 14,
        background: accent ? 'var(--color-warning-dim)' : 'var(--color-surface)',
      }}
    >
      <div style={{ width: 42, height: 42, borderRadius: 12, background: `color-mix(in srgb, ${color} 14%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={21} style={{ color }} />
      </div>
      <div>
        <div className="tabnum" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 3 }}>{label}</div>
      </div>
    </button>
  )
}

import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import Sheet from './Sheet'
import { useAuth } from '@/context/AuthContext'
import { canManageStock } from '@/lib/permissions'
import { useLogMovement, useStocktake, stockStatus } from '@/hooks/useInventory'
import { formatQty } from '@/lib/formatters'
import type { Item } from '@/types'

type Action = 'deduct' | 'add' | 'stocktake'

const STATUS_BADGE: Record<string, string> = { ok: 'badge-ok', low: 'badge-low', out: 'badge-out' }
const STATUS_LABEL: Record<string, string> = { ok: 'In stock', low: 'Low', out: 'Out' }

export default function QuantitySheet({ open, onClose, item }: { open: boolean; onClose: () => void; item: Item | null }) {
  const { profile } = useAuth()
  const canManage = profile ? canManageStock(profile.role) : false
  const logMovement = useLogMovement()
  const stocktake = useStocktake()

  const [action, setAction] = useState<Action>('deduct')
  const [amount, setAmount] = useState<number>(1)

  // Reset when the item changes / sheet opens
  useEffect(() => {
    if (open && item) {
      setAction('deduct')
      setAmount(1)
    }
  }, [open, item])

  if (!item) return null
  const unit = item.unit?.abbreviation || ''
  const status = stockStatus(item)
  const busy = logMovement.isPending || stocktake.isPending

  // For stocktake the amount represents the new absolute count
  const displayValue = action === 'stocktake' ? amount : amount
  const step = (d: number) => setAmount(v => Math.max(0, Math.round((v + d) * 100) / 100))

  async function confirm() {
    if (!item) return
    if (action === 'stocktake') {
      await stocktake.mutateAsync({ item, newCount: amount })
    } else {
      await logMovement.mutateAsync({ item, type: action, amount })
    }
    onClose()
  }

  const onStartStocktake = () => { setAction('stocktake'); setAmount(Number(item.current_quantity)) }
  const onStartOther = (a: Action) => { setAction(a); setAmount(1) }

  const confirmLabel = action === 'deduct' ? `Use ${formatQty(amount)} ${unit}`
    : action === 'add' ? `Add ${formatQty(amount)} ${unit}`
    : `Set count to ${formatQty(amount)} ${unit}`

  return (
    <Sheet open={open} onClose={onClose} maxHeight="auto">
      <div style={{ padding: '0 20px' }}>
        {/* Item header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
            <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginTop: 2 }}>
              {formatQty(item.current_quantity)} {unit} on hand · par {formatQty(item.par_level)}
            </div>
          </div>
          <span className={`badge ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>
        </div>

        {/* Action selector */}
        <div className="segmented" style={{ margin: '18px 0' }}>
          <button data-active={action === 'deduct'} onClick={() => onStartOther('deduct')}>Use</button>
          {canManage && <button data-active={action === 'add'} onClick={() => onStartOther('add')}>Add</button>}
          {canManage && <button data-active={action === 'stocktake'} onClick={onStartStocktake}>Set</button>}
        </div>

        {/* Stepper */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, padding: '6px 0 18px' }}>
          <button onClick={() => step(-1)} className="btn btn-secondary" style={{ width: 60, height: 60, borderRadius: 18, padding: 0 }} disabled={amount <= 0}>
            <Minus size={26} />
          </button>
          <div style={{ minWidth: 120, textAlign: 'center' }}>
            <div className="tabnum" style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: 'var(--color-accent)' }}>{formatQty(displayValue)}</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginTop: 4 }}>{unit || 'units'}</div>
          </div>
          <button onClick={() => step(1)} className="btn btn-secondary" style={{ width: 60, height: 60, borderRadius: 18, padding: 0 }}>
            <Plus size={26} />
          </button>
        </div>

        {/* Quick chips */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
          {[1, 2, 5, 10].map(n => (
            <button
              key={n}
              onClick={() => action === 'stocktake' ? setAmount(n) : setAmount(a => Math.round((a + n) * 100) / 100)}
              className="btn btn-secondary btn-sm"
              style={{ minWidth: 54 }}
            >
              {action === 'stocktake' ? n : `+${n}`}
            </button>
          ))}
        </div>

        <button
          onClick={confirm}
          className={`btn btn-block ${action === 'deduct' ? 'btn-primary' : 'btn-primary'}`}
          style={{ height: 54, fontSize: 16.5 }}
          disabled={busy || (action !== 'stocktake' && amount <= 0)}
        >
          {busy ? 'Saving…' : confirmLabel}
        </button>
      </div>
    </Sheet>
  )
}

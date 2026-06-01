import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import Sheet from './Sheet'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useUnits, useCategories } from '@/hooks/useInventory'
import { useQueryClient } from '@tanstack/react-query'
import type { Item } from '@/types'

export default function ItemFormSheet({ open, onClose, item }: { open: boolean; onClose: () => void; item?: Item | null }) {
  const { boat } = useAuth()
  const qc = useQueryClient()
  const { data: units = [] } = useUnits()
  const { data: categories = [] } = useCategories()
  const editing = !!item

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [price, setPrice] = useState('')
  const [par, setPar] = useState('')
  const [opening, setOpening] = useState('')
  const [location, setLocation] = useState('')
  const [purchaseLocation, setPurchaseLocation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (item) {
      setName(item.name)
      setCategoryId(item.category_id ?? '')
      setUnitId(item.unit_id ?? '')
      setPrice(String(item.price_per_unit ?? ''))
      setPar(String(item.par_level ?? ''))
      setLocation(item.location ?? '')
      setPurchaseLocation(item.purchase_location ?? '')
      setOpening('')
    } else {
      setName(''); setCategoryId(''); setUnitId(''); setPrice(''); setPar(''); setOpening(''); setLocation(''); setPurchaseLocation('')
    }
  }, [open, item])

  async function save() {
    if (!name.trim()) { setError('Give the item a name'); return }
    setBusy(true); setError(null)
    try {
      if (editing && item) {
        const { error } = await supabase.from('items').update({
          name: name.trim(),
          category_id: categoryId || null,
          unit_id: unitId || null,
          price_per_unit: Number(price) || 0,
          par_level: Number(par) || 0,
          location: location.trim() || null,
          purchase_location: purchaseLocation.trim() || null,
        }).eq('id', item.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('items').insert({
          boat_id: boat!.id,
          name: name.trim(),
          category_id: categoryId || null,
          unit_id: unitId || null,
          price_per_unit: Number(price) || 0,
          par_level: Number(par) || 0,
          location: location.trim() || null,
          purchase_location: purchaseLocation.trim() || null,
        }).select('id').single()
        if (error) throw error
        const openQty = Number(opening) || 0
        if (openQty > 0 && data) {
          await supabase.from('stock_movements').insert({
            boat_id: boat!.id, item_id: data.id, change_qty: openQty, type: 'add', note: 'Opening stock',
          })
        }
      }
      qc.invalidateQueries({ queryKey: ['items'] })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!item) return
    if (!confirm(`Delete "${item.name}"? This removes the item and its history.`)) return
    setBusy(true)
    try {
      const { error } = await supabase.from('items').delete().eq('id', item.id)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['items'] })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={editing ? 'Edit item' : 'New item'} maxHeight="92vh">
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Heineken 330ml" autoFocus />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="label">Category</label>
            <select className="input" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">None</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">Unit</label>
            <select className="input" value={unitId} onChange={e => setUnitId(e.target.value)}>
              <option value="">None</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="label">Price / unit ({boat?.currency ?? 'ZAR'})</label>
            <input className="input tabnum" type="number" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">Par level</label>
            <input className="input tabnum" type="number" inputMode="decimal" value={par} onChange={e => setPar(e.target.value)} placeholder="0" />
          </div>
        </div>

        {!editing && (
          <div>
            <label className="label">Opening stock (optional)</label>
            <input className="input tabnum" type="number" inputMode="decimal" value={opening} onChange={e => setOpening(e.target.value)} placeholder="0" />
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="label">Stored (optional)</label>
            <input className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Bar fridge" />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">Bought at (optional)</label>
            <input className="input" value={purchaseLocation} onChange={e => setPurchaseLocation(e.target.value)} placeholder="e.g. Makro, V&A" />
          </div>
        </div>

        {error && (
          <div style={{ padding: '11px 14px', borderRadius: 12, background: 'var(--color-danger-dim)', color: 'var(--color-danger)', fontSize: 13.5 }}>{error}</div>
        )}

        <button className="btn btn-primary btn-block" style={{ height: 52, fontSize: 16 }} onClick={save} disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Add item'}
        </button>

        {editing && (
          <button className="btn btn-danger btn-block" onClick={remove} disabled={busy} style={{ marginBottom: 4 }}>
            <Trash2 size={17} /> Delete item
          </button>
        )}
      </div>
    </Sheet>
  )
}

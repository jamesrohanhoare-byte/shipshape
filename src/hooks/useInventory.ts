import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { notifyLowStock } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import type { Item, Unit, Category, MovementType } from '@/types'

export function useItems() {
  return useQuery<Item[]>({
    queryKey: ['items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('items')
        .select('*, unit:units(*), category:categories(*)')
        .order('name')
      if (error) throw error
      return (data ?? []) as Item[]
    },
  })
}

export function useUnits() {
  return useQuery<Unit[]>({
    queryKey: ['units'],
    queryFn: async () => {
      const { data, error } = await supabase.from('units').select('*').order('name')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCategories() {
  return useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('name')
      if (error) throw error
      return data ?? []
    },
  })
}

/** Log a stock movement (add/deduct/adjust/stocktake). Fires low-stock push when a deduct crosses par. */
export function useLogMovement() {
  const qc = useQueryClient()
  const { boat } = useAuth()
  return useMutation({
    mutationFn: async (input: { item: Item; type: MovementType; amount: number; note?: string }) => {
      const { item, type, amount, note } = input
      // Signed delta: deduct subtracts, everything else adds the given amount
      const change = type === 'deduct' ? -Math.abs(amount) : Math.abs(amount)
      const { error } = await supabase.from('stock_movements').insert({
        boat_id: boat!.id,
        item_id: item.id,
        change_qty: change,
        type,
        note: note || null,
      })
      if (error) throw error

      const newQty = Math.max(0, Number(item.current_quantity) + change)
      const crossedPar = type === 'deduct' && newQty <= Number(item.par_level)
      return { itemId: item.id, crossedPar }
    },
    onSuccess: async ({ itemId, crossedPar }) => {
      qc.invalidateQueries({ queryKey: ['items'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
      if (crossedPar) await notifyLowStock(itemId)
    },
  })
}

/** Adjust to an absolute count (stocktake) — computes the delta for the ledger. */
export function useStocktake() {
  const qc = useQueryClient()
  const { boat } = useAuth()
  return useMutation({
    mutationFn: async (input: { item: Item; newCount: number; note?: string }) => {
      const delta = Number(input.newCount) - Number(input.item.current_quantity)
      const { error } = await supabase.from('stock_movements').insert({
        boat_id: boat!.id,
        item_id: input.item.id,
        change_qty: delta,
        type: 'stocktake',
        note: input.note || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
    },
  })
}

export type StockStatus = 'ok' | 'low' | 'out'
export function stockStatus(item: Pick<Item, 'current_quantity' | 'par_level'>): StockStatus {
  const q = Number(item.current_quantity)
  if (q <= 0) return 'out'
  if (q <= Number(item.par_level)) return 'low'
  return 'ok'
}

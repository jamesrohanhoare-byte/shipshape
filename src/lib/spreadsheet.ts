import { supabase } from './supabase'
import type { Item } from '@/types'

/**
 * Flexible spreadsheet import/export for stock items.
 * xlsx is lazy-loaded so it only ships when the Data tab is actually used.
 * Column matching is forgiving: only Name is required; everything else optional
 * (crews' real sheets often have no price or unit of measure).
 */

export interface ParsedRow {
  name: string
  category?: string
  unit?: string
  price?: number
  par?: number
  qty?: number
  location?: string
}

// Map of normalised header → our field. Many aliases so real sheets "just work".
const HEADER_ALIASES: Record<string, keyof ParsedRow> = {
  name: 'name', item: 'name', 'item name': 'name', product: 'name', description: 'name', 'product name': 'name', stock: 'name', 'stock item': 'name',
  category: 'category', cat: 'category', group: 'category', type: 'category', section: 'category',
  unit: 'unit', 'unit of measure': 'unit', uom: 'unit', measure: 'unit', units: 'unit',
  price: 'price', cost: 'price', 'unit price': 'price', 'price per unit': 'price', value: 'price', 'cost price': 'price',
  par: 'par', 'par level': 'par', min: 'par', minimum: 'par', 'min level': 'par', reorder: 'par', 'reorder level': 'par',
  qty: 'qty', quantity: 'qty', 'on hand': 'qty', count: 'qty', opening: 'qty', 'opening stock': 'qty', 'in stock': 'qty', amount: 'qty', 'current quantity': 'qty',
  location: 'location', loc: 'location', where: 'location', area: 'location', store: 'location', shelf: 'location',
}

async function getXLSX() {
  return await import('xlsx')
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return isNaN(v) ? undefined : v
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''))
  return isNaN(n) ? undefined : n
}

function mapRow(raw: Record<string, unknown>): ParsedRow {
  const out: ParsedRow = { name: '' }
  for (const [key, val] of Object.entries(raw)) {
    const field = HEADER_ALIASES[key.trim().toLowerCase()]
    if (!field) continue
    if (field === 'price' || field === 'par' || field === 'qty') {
      const n = toNumber(val)
      if (n !== undefined) out[field] = n
    } else {
      const s = String(val).trim()
      if (s) out[field] = s
    }
  }
  return out
}

/** Parse an uploaded .xlsx/.xls/.csv file into rows (name required). */
export async function parseSpreadsheet(file: File): Promise<ParsedRow[]> {
  const XLSX = await getXLSX()
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
  return raw.map(mapRow).filter(r => r.name)
}

/** Download a ready-to-fill template in the format the importer expects. */
export async function downloadTemplate() {
  const XLSX = await getXLSX()
  const sample = [
    { Name: 'Heineken 330ml', Category: 'Beverages', Unit: 'Bottle', Price: 18, Par: 24, Quantity: 48, Location: 'Bar fridge' },
    { Name: 'Toilet paper', Category: 'Toiletries', Unit: 'Roll', Price: 6, Par: 20, Quantity: 40, Location: 'Lazarette' },
    { Name: 'Dishwasher tablets', Category: 'Cleaning', Unit: 'Each', Price: 3.5, Par: 30, Quantity: 60, Location: 'Galley' },
  ]
  const ws = XLSX.utils.json_to_sheet(sample)
  ws['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 16 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Stock')
  XLSX.writeFile(wb, 'shipshape-stock-template.xlsx')
}

/** Export current stock to an .xlsx file (also serves as a manual backup). */
export async function exportItems(items: Item[], boatName: string) {
  const XLSX = await getXLSX()
  const rows = items.map(i => ({
    Name: i.name,
    Category: i.category?.name ?? '',
    Unit: i.unit?.name ?? '',
    Price: Number(i.price_per_unit),
    Par: Number(i.par_level),
    Quantity: Number(i.current_quantity),
    Location: i.location ?? '',
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Stock')
  const safe = boatName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `${safe}-stock-${date}.xlsx`)
}

/** Commit parsed rows: auto-creates missing categories/units, then bulk-inserts items. */
export async function importItems(boatId: string, rows: ParsedRow[]): Promise<{ imported: number; errors: string[] }> {
  const errors: string[] = []

  // Load existing categories & units, build lookup maps (by lowercase name / abbr)
  const [{ data: cats }, { data: units }] = await Promise.all([
    supabase.from('categories').select('id, name'),
    supabase.from('units').select('id, name, abbreviation'),
  ])
  const catMap = new Map<string, string>((cats ?? []).map(c => [c.name.trim().toLowerCase(), c.id]))
  const unitMap = new Map<string, string>()
  for (const u of units ?? []) {
    unitMap.set(u.name.trim().toLowerCase(), u.id)
    if (u.abbreviation) unitMap.set(u.abbreviation.trim().toLowerCase(), u.id)
  }

  // Create any categories/units referenced in the sheet but not yet present
  const newCats = [...new Set(rows.map(r => r.category?.trim()).filter((c): c is string => !!c && !catMap.has(c.toLowerCase())))]
  if (newCats.length) {
    const { data } = await supabase.from('categories').insert(newCats.map(name => ({ boat_id: boatId, name }))).select('id, name')
    for (const c of data ?? []) catMap.set(c.name.trim().toLowerCase(), c.id)
  }
  const newUnits = [...new Set(rows.map(r => r.unit?.trim()).filter((u): u is string => !!u && !unitMap.has(u.toLowerCase())))]
  if (newUnits.length) {
    const { data } = await supabase.from('units').insert(newUnits.map(name => ({ boat_id: boatId, name, abbreviation: name.slice(0, 6) }))).select('id, name')
    for (const u of data ?? []) unitMap.set(u.name.trim().toLowerCase(), u.id)
  }

  // Build item rows. current_quantity is set directly as the opening baseline.
  const payload = rows.map(r => ({
    boat_id: boatId,
    name: r.name.trim(),
    category_id: r.category ? catMap.get(r.category.trim().toLowerCase()) ?? null : null,
    unit_id: r.unit ? unitMap.get(r.unit.trim().toLowerCase()) ?? null : null,
    price_per_unit: r.price ?? 0,
    par_level: r.par ?? 0,
    current_quantity: r.qty ?? 0,
    location: r.location ?? null,
  }))

  // Insert in chunks to stay well within limits
  let imported = 0
  const CHUNK = 200
  for (let i = 0; i < payload.length; i += CHUNK) {
    const slice = payload.slice(i, i + CHUNK)
    const { error, count } = await supabase.from('items').insert(slice, { count: 'exact' })
    if (error) errors.push(error.message)
    else imported += count ?? slice.length
  }

  return { imported, errors }
}

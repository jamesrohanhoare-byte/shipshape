import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FileDown, FileUp, Download, Check, AlertTriangle, Loader2, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useItems } from '@/hooks/useInventory'
import { parseSpreadsheet, downloadTemplate, exportItems, importItems, type ParsedRow } from '@/lib/spreadsheet'

export default function SettingsDataTab() {
  const { boat } = useAuth()
  const qc = useQueryClient()
  const { data: items = [] } = useItems()

  const [rows, setRows] = useState<ParsedRow[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null); setResult(null); setBusy(true); setFileName(file.name)
    try {
      const parsed = await parseSpreadsheet(file)
      if (parsed.length === 0) {
        setError('No rows with a Name column were found. Check the headers or use the template.')
        setRows(null)
      } else {
        setRows(parsed)
      }
    } catch {
      setError('Could not read that file. Use .xlsx, .xls, or .csv.')
      setRows(null)
    } finally {
      setBusy(false)
    }
  }

  async function commit() {
    if (!boat || !rows) return
    setBusy(true); setError(null)
    try {
      const res = await importItems(boat.id, rows)
      setResult(res)
      setRows(null)
      qc.invalidateQueries({ queryKey: ['items'] })
      qc.invalidateQueries({ queryKey: ['units'] })
      qc.invalidateQueries({ queryKey: ['categories'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  const withPrice = rows?.filter(r => r.price != null).length ?? 0
  const withUnit = rows?.filter(r => r.unit).length ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Import */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FileUp size={21} style={{ color: 'var(--color-accent)' }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Import stock</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Bulk-load from your existing spreadsheet</div>
          </div>
        </div>

        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.55, margin: 0 }}>
          Upload an Excel/CSV file. The only required column is <b>Name</b> — <b>Category, Unit, Price, Par, Quantity, Location</b> are matched automatically if present (any common heading works). Missing price or unit? No problem — you can fill those in later.
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => downloadTemplate()} style={{ flex: 1 }}>
            <FileDown size={16} /> Template
          </button>
          <label className="btn btn-primary btn-sm" style={{ flex: 1, cursor: 'pointer' }}>
            <FileUp size={16} /> Choose file
            <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{ display: 'none' }} />
          </label>
        </div>

        {busy && !rows && <Inline icon={<Loader2 size={16} className="spin" />} text="Reading file…" />}
        {error && <Banner tone="danger" icon={<AlertTriangle size={16} />} text={error} />}

        {/* Preview + confirm */}
        {rows && (
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: 14, background: 'var(--color-sunken)' }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{rows.length} item{rows.length === 1 ? '' : 's'} found in {fileName}</div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', margin: '4px 0 10px' }}>
              {withPrice} with price · {withUnit} with unit · auto-creating any new categories/units
            </div>
            <div style={{ maxHeight: 140, overflowY: 'auto', marginBottom: 12 }}>
              {rows.slice(0, 8).map((r, i) => (
                <div key={i} style={{ fontSize: 13, padding: '4px 0', borderTop: i ? '1px solid var(--color-divider)' : 'none', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  <span style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{r.qty ?? 0}{r.unit ? ` ${r.unit}` : ''}</span>
                </div>
              ))}
              {rows.length > 8 && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', paddingTop: 6 }}>+ {rows.length - 8} more…</div>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setRows(null)} style={{ flex: 1 }}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={commit} disabled={busy} style={{ flex: 2 }}>
                {busy ? 'Importing…' : `Import ${rows.length} items`}
              </button>
            </div>
          </div>
        )}

        {result && (
          <Banner
            tone={result.errors.length ? 'warn' : 'ok'}
            icon={result.errors.length ? <AlertTriangle size={16} /> : <Check size={16} />}
            text={`Imported ${result.imported} item${result.imported === 1 ? '' : 's'}${result.errors.length ? ` · ${result.errors.length} skipped` : ''}.`}
          />
        )}
      </div>

      {/* Export / backup */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Download size={21} style={{ color: 'var(--color-accent)' }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Export &amp; backup</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Download your full stock list</div>
          </div>
        </div>
        <button className="btn btn-secondary btn-block" onClick={() => exportItems(items, boat?.name ?? 'boat')} disabled={items.length === 0}>
          <Download size={17} /> Export {items.length} items to Excel
        </button>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
          <ShieldCheck size={16} style={{ color: 'var(--color-success)', flexShrink: 0, marginTop: 1 }} />
          <span>Your data is also backed up automatically every day on the server. This export is your own offline copy.</span>
        </div>
      </div>

      <style>{`.spin { animation: spin 1s linear infinite } @keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function Inline({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--color-text-secondary)' }}>{icon}{text}</div>
}
function Banner({ tone, icon, text }: { tone: 'ok' | 'warn' | 'danger'; icon: React.ReactNode; text: string }) {
  const bg = tone === 'ok' ? 'var(--color-success-dim)' : tone === 'warn' ? 'var(--color-warning-dim)' : 'var(--color-danger-dim)'
  const fg = tone === 'ok' ? 'var(--color-success)' : tone === 'warn' ? 'var(--color-warning)' : 'var(--color-danger)'
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderRadius: 12, background: bg, color: fg, fontSize: 13.5 }}>{icon}<span>{text}</span></div>
}

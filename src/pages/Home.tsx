import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Anchor, TriangleAlert, ListChecks, Briefcase, Moon, Wallet, ArrowDownRight, ArrowUpRight, ClipboardList, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useItems, stockStatus } from '@/hooks/useInventory'
import { useCrew } from '@/hooks/useCrew'
import { formatQty, formatRelative } from '@/lib/formatters'
import { useMoney, useShowFinancials } from '@/hooks/useMoney'
import { toDateStr, today, occursOnDate } from '@/lib/taskScheduling'
import type { StockMovement, Item, Task, TimeLog } from '@/types'

interface MovementRow extends StockMovement { item?: Pick<Item, 'name'> | null }

export default function Home() {
  const navigate = useNavigate()
  const { profile, boat } = useAuth()
  const money = useMoney()
  const showFinancials = useShowFinancials()
  const { data: items = [] } = useItems()
  const { data: crew = [] } = useCrew()

  const todayKey = toDateStr(today())

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

  // Tasks due today (one-off + recurring occurrences not yet done/skipped).
  const { data: tasksDue = 0 } = useQuery<number>({
    queryKey: ['home_tasks_due', todayKey],
    queryFn: async () => {
      const [oneOff, recurringRes] = await Promise.all([
        supabase.from('tasks').select('id').eq('due_date', todayKey).eq('is_recurring', false).neq('status', 'done'),
        supabase.from('tasks').select('*').eq('is_recurring', true).lte('recurrence_start_date', todayKey),
      ])
      const recurring = (recurringRes.data ?? []).filter(t => occursOnDate(t as Task, today()))
      let doneIds = new Set<string>()
      if (recurring.length) {
        const { data } = await supabase.from('task_completions').select('task_id, done, skipped').in('task_id', recurring.map(t => t.id)).eq('occurrence_date', todayKey)
        doneIds = new Set((data ?? []).filter(c => c.done || c.skipped).map(c => c.task_id))
      }
      return (oneOff.data?.length ?? 0) + recurring.filter(t => !doneIds.has(t.id)).length
    },
  })

  // My hours this week (work + sleep).
  const weekFromISO = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString() }, [])
  const { data: myHours = { work: 0, sleep: 0 } } = useQuery<{ work: number; sleep: number }>({
    queryKey: ['home_hours', profile?.id],
    queryFn: async () => {
      const { data } = await supabase.from('time_logs').select('kind, hours, user_id').gte('started_at', weekFromISO)
      const mine = (data ?? []) as Pick<TimeLog, 'kind' | 'hours' | 'user_id'>[]
      const sum = (k: string) => Math.round(mine.filter(l => l.user_id === profile?.id && l.kind === k).reduce((s, l) => s + Number(l.hours), 0))
      return { work: sum('work'), sleep: sum('sleep') }
    },
  })

  const lowItems = useMemo(() => items.filter(i => stockStatus(i) !== 'ok'), [items])
  const outCount = useMemo(() => items.filter(i => stockStatus(i) === 'out').length, [items])
  const stockValue = useMemo(() => items.reduce((s, i) => s + Number(i.current_quantity) * Number(i.price_per_unit), 0), [items])
  const crewName = (id: string | null) => crew.find(c => c.id === id)?.full_name ?? 'Crew'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const taskSub = tasksDue === 0 ? 'All clear for today' : 'Tap to see what’s due'
  const lowSub = lowItems.length === 0 ? 'Everything above par' : outCount > 0 ? `${outCount} out of stock · tap to shop` : 'Tap to shop'

  return (
    <div style={{ padding: '2px 16px' }}>
      {/* Boat header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 4px 14px' }}
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

      {/* Needs attention */}
      <div className="section-header" style={{ paddingLeft: 4 }}>Needs attention</div>
      <div className="card" style={{ padding: 6, marginBottom: 4 }}>
        <AttentionRow
          tone="accent" icon={ListChecks}
          big={tasksDue === 0 ? 'No tasks due today' : `${tasksDue} task${tasksDue === 1 ? '' : 's'} due today`}
          sub={taskSub} onClick={() => navigate('/tasks')}
        />
        <div style={{ height: 1, background: 'var(--color-divider)', margin: '0 14px' }} />
        <AttentionRow
          tone={lowItems.length > 0 ? 'warn' : 'ok'} icon={TriangleAlert}
          big={lowItems.length === 0 ? 'All stocked up' : `${lowItems.length} item${lowItems.length === 1 ? '' : 's'} low`}
          sub={lowSub} onClick={() => navigate('/shopping')}
        />
      </div>

      {/* Your week */}
      <div className="section-header" style={{ paddingLeft: 4 }}>Your week</div>
      <div style={{ display: 'flex', gap: 12, marginBottom: showFinancials ? 12 : 4 }}>
        <WeekCard icon={Briefcase} value={myHours.work} label="worked" onClick={() => navigate('/hours')} />
        <WeekCard icon={Moon} value={myHours.sleep} label="slept" onClick={() => navigate('/hours')} />
      </div>
      {showFinancials && (
        <button className="card" onClick={() => navigate('/stock')} style={{ width: '100%', border: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4, cursor: 'pointer' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Wallet size={18} style={{ color: 'var(--color-accent)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="tabnum" style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>{money(stockValue, { compact: true })}</div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>stock on hand</div>
          </div>
          <ChevronRight size={18} style={{ color: 'var(--color-text-faint)' }} />
        </button>
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

function AttentionRow({ icon: Icon, big, sub, tone, onClick }: {
  icon: typeof ListChecks; big: string; sub: string; tone: 'accent' | 'warn' | 'ok'; onClick: () => void
}) {
  const color = tone === 'warn' ? 'var(--color-warning)' : tone === 'ok' ? 'var(--color-success)' : 'var(--color-accent)'
  return (
    <button onClick={onClick} style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 13, padding: 14, borderRadius: 13, textAlign: 'left' }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: `color-mix(in srgb, ${color} 14%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={21} style={{ color }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{big}</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 1 }}>{sub}</div>
      </div>
      <ChevronRight size={20} style={{ color: 'var(--color-text-faint)', marginLeft: 'auto', flexShrink: 0 }} />
    </button>
  )
}

function WeekCard({ icon: Icon, value, label, onClick }: { icon: typeof Briefcase; value: number; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card" style={{ flex: 1, border: 'none', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={17} style={{ color: 'var(--color-accent)' }} />
      </div>
      <div>
        <div className="tabnum" style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}<span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontWeight: 600 }}> h</span></div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>{label}</div>
      </div>
    </button>
  )
}

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Anchor, Package, TriangleAlert, Users, FileUp, Smartphone, Share, Plus, Check,
  ArrowRight, ChevronLeft, Ruler, ListChecks, Clock,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { canEditBoatSettings } from '@/lib/permissions'
import { usePWAInstall } from '@/hooks/usePWAInstall'

type Visual = 'home' | 'stock' | 'shopping' | 'tasks' | 'hours' | 'item' | 'crew' | 'data'

interface Step {
  icon: LucideIcon
  title: string
  body: string
  visual?: Visual
  adminOnly?: boolean
  install?: boolean
}

export default function Onboarding({ onFinish }: { onFinish: () => void }) {
  const { profile, boat } = useAuth()
  const isAdmin = profile ? canEditBoatSettings(profile.role) : false
  const { state, platform, install } = usePWAInstall()

  const steps = useMemo<Step[]>(() => ([
    { icon: Anchor, title: `Welcome aboard, ${profile?.full_name?.split(' ')[0] ?? 'Captain'}`, body: `${boat?.name ?? 'Your boat'} is ready. Home is your bridge — it shows what needs you right now: tasks due today and anything running low.`, visual: 'home' },
    { icon: Package, title: 'The daily loop', body: 'The heart of it: open Stock, tap an item, hit Use, and enter how many you took. The count drops instantly and records who used it. Everyone does this — two seconds.', visual: 'stock' },
    { icon: TriangleAlert, title: 'Par levels do the watching', body: 'The moment an item hits its par level it lands on the Shopping tab automatically and the captain & manager get a push. Nothing runs out by surprise.', visual: 'shopping' },
    { icon: ListChecks, title: 'Tasks & night watch', body: 'Plan the day on a strip you swipe by date. Tap the circle to move a task To do → Doing → Done. Flag night-watch jobs so whoever’s on watch sees just theirs. Unfinished work carries to the next day.', visual: 'tasks' },
    { icon: Clock, title: 'Hours & rest', body: 'Log your work and sleep under Hours. The captain sees the whole crew and gets MLC rest-hour flags — so you stay compliant without the paperwork.', visual: 'hours' },
    { icon: Ruler, title: 'Items, units & par', body: 'Captain & Manager add each item with a UNIT (Bottle, Each, Litre…), a PRICE, a PAR LEVEL, and where you buy it. Set your currency once in Settings.', visual: 'item', adminOnly: true },
    { icon: Users, title: 'Give each crew their own login', body: 'Settings → Crew: add managers, deckhands and engineers, each with their own login. Deckhands log usage, managers run stock, you run everything — and you always see who did what.', visual: 'crew', adminOnly: true },
    { icon: FileUp, title: 'Bring your existing stock', body: 'Got a spreadsheet? Settings → Data → use the template or upload your own. Only an item Name is required — the rest is matched automatically.', visual: 'data', adminOnly: true },
    { icon: Smartphone, title: 'Add it to your Home Screen', body: 'Install ShipShape so it runs full-screen like a real app — and so push alerts work on iPhone.', install: true },
  ] as Step[]).filter(s => !s.adminOnly || isAdmin), [profile, boat, isAdmin])

  const [i, setI] = useState(0)
  const [dir, setDir] = useState(1)
  const step = steps[i]
  const isLast = i === steps.length - 1

  const go = (n: number) => { setDir(n > i ? 1 : -1); setI(Math.max(0, Math.min(steps.length - 1, n))) }
  const next = () => { if (isLast) onFinish(); else go(i + 1) }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'linear-gradient(165deg, var(--color-accent) 0%, color-mix(in srgb, var(--color-accent) 55%, #001016) 62%, #00121a 100%)',
      display: 'flex', flexDirection: 'column',
      padding: 'calc(env(safe-area-inset-top) + 14px) 22px calc(env(safe-area-inset-bottom) + 22px)',
      color: '#fff',
    }}>
      {/* Top bar: progress dots + skip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {steps.map((_, idx) => (
            <div key={idx} style={{
              width: idx === i ? 22 : 7, height: 7, borderRadius: 4,
              background: idx === i ? '#fff' : 'rgba(255,255,255,0.35)',
              transition: 'width 0.3s, background 0.3s',
            }} />
          ))}
        </div>
        {!isLast && (
          <button onClick={onFinish} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 6 }}>Skip</button>
        )}
      </div>

      {/* Slide */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={i}
            custom={dir}
            initial={{ opacity: 0, x: dir * 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -60 }}
            transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(_e, info) => {
              if (info.offset.x < -80) next()
              else if (info.offset.x > 80 && i > 0) go(i - 1)
            }}
            style={{ width: '100%' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 20 }}>
              {step.visual ? (
                <Preview kind={step.visual} />
              ) : (
                <div style={{ width: 84, height: 84, borderRadius: 24, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.22)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <step.icon size={40} color="#fff" strokeWidth={2.2} />
                </div>
              )}
              <div>
                <h1 style={{ margin: 0, fontSize: 27, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.12 }}>{step.title}</h1>
                <p style={{ margin: '12px 0 0', fontSize: 16, lineHeight: 1.55, color: 'rgba(255,255,255,0.85)' }}>{step.body}</p>
              </div>

              {step.install && (
                <div style={{ width: '100%', marginTop: 2 }}>
                  {state === 'standalone' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: '14px 16px' }}>
                      <Check size={20} /> <span style={{ fontWeight: 600 }}>Already installed — you're all set.</span>
                    </div>
                  ) : platform === 'ios' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <InstallStep n={1} text="Tap the Share button in Safari" icon={<Share size={16} color="#fff" />} />
                      <InstallStep n={2} text="Tap “Add to Home Screen”" icon={<Plus size={16} color="#fff" />} />
                    </div>
                  ) : (
                    <button onClick={install} className="btn" style={{ background: '#fff', color: 'var(--color-accent)', height: 50, width: '100%', fontWeight: 700 }}>
                      <Smartphone size={18} /> Add to Home Screen
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {i > 0 ? (
          <button onClick={() => go(i - 1)} className="btn" style={{ background: 'rgba(255,255,255,0.16)', color: '#fff', width: 52, height: 54, padding: 0, borderRadius: 16 }}>
            <ChevronLeft size={22} />
          </button>
        ) : <div style={{ width: 52 }} />}
        <button onClick={next} className="btn" style={{ flex: 1, background: '#fff', color: 'var(--color-accent)', height: 54, fontSize: 17, fontWeight: 700, borderRadius: 16 }}>
          {isLast ? "Let's go" : 'Next'} {isLast ? <Check size={20} /> : <ArrowRight size={20} />}
        </button>
      </div>
    </div>
  )
}

function InstallStep({ n, text, icon }: { n: number; text: string; icon: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: '13px 15px' }}>
      <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>{n}</div>
      <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{text}</span>
      {icon}
    </div>
  )
}

/* ── Mini in-app previews (teach by showing the real UI, stylised) ── */
const TEAL = '#0E8C9B'
function Preview({ kind }: { kind: Visual }) {
  return (
    <div style={{
      width: '100%', maxWidth: 320, alignSelf: 'center',
      background: '#F4F6F8', borderRadius: 20, padding: 12,
      boxShadow: '0 16px 40px -12px rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.25)',
      color: '#0B1722',
    }}>
      {kind === 'home' && <HomeP />}
      {kind === 'stock' && <StockP />}
      {kind === 'shopping' && <ShoppingP />}
      {kind === 'tasks' && <TasksP />}
      {kind === 'hours' && <HoursP />}
      {kind === 'item' && <ItemP />}
      {kind === 'crew' && <CrewP />}
      {kind === 'data' && <DataP />}
    </div>
  )
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(11,23,34,.07)' }
const muted: React.CSSProperties = { fontSize: 11, color: '#8A96A0' }

function PHead({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8A96A0', margin: '2px 2px 7px' }}>{children}</div>
}

function HomeP() {
  return (
    <>
      <PHead>Needs attention</PHead>
      <div style={{ ...card, padding: 5, marginBottom: 8 }}>
        {[['☑', TEAL, '3 tasks due today'], ['▾', '#E0922F', '5 items low']].map(([ic, col, label], k) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderTop: k ? '1px solid #E6EAEE' : 'none' }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: `color-mix(in srgb, ${col} 14%, transparent)`, color: col as string, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{ic}</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
            <span style={{ marginLeft: 'auto', color: '#C2CBD2' }}>›</span>
          </div>
        ))}
      </div>
      <PHead>Your week</PHead>
      <div style={{ display: 'flex', gap: 8 }}>
        <MiniStat n="52h" l="worked" /><MiniStat n="41h" l="slept" />
      </div>
    </>
  )
}
function MiniStat({ n, l }: { n: string; l: string }) {
  return <div style={{ ...card, flex: 1, padding: 10 }}><div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.02em' }}>{n}</div><div style={muted}>{l}</div></div>
}

function StockP() {
  const rows = [['Heineken 330ml', '24 btl', '#1FA463', 'OK'], ['Loo roll', '2', '#E0922F', 'Low']] as const
  return (
    <>
      <PHead>Stock</PHead>
      <div style={{ ...card, overflow: 'hidden', marginBottom: 8 }}>
        {rows.map((r, k) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', padding: '10px 11px', borderTop: k ? '1px solid #E6EAEE' : 'none' }}>
            <div style={{ flex: 1, fontWeight: 600, fontSize: 13.5 }}>{r[0]}</div>
            <div style={{ fontWeight: 800, fontSize: 14, marginRight: 8 }}>{r[1]}</div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 7, color: r[2], background: `color-mix(in srgb, ${r[2]} 14%, transparent)` }}>{r[3]}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ background: TEAL, color: '#fff', fontWeight: 700, fontSize: 13, padding: '9px 22px', borderRadius: 12, boxShadow: `0 0 0 4px color-mix(in srgb, ${TEAL} 22%, transparent)` }}>Use −1 ▾</div>
      </div>
    </>
  )
}

function ShoppingP() {
  return (
    <>
      <PHead>Shopping · auto-built</PHead>
      <div style={{ ...card, overflow: 'hidden', marginBottom: 8 }}>
        {[['#E2533B', 'Loo roll', 'buy ~10'], ['#E0922F', 'Fresh milk', 'buy ~6']].map((r, k) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 11px', borderTop: k ? '1px solid #E6EAEE' : 'none' }}>
            <span style={{ width: 7, height: 7, borderRadius: 4, background: r[0] as string }} />
            <div style={{ flex: 1, fontWeight: 600, fontSize: 13.5 }}>{r[1]}</div>
            <div style={muted}>{r[2]}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 11, padding: '9px 11px', boxShadow: '0 1px 3px rgba(11,23,34,.07)' }}>
        <span style={{ fontSize: 15 }}>🔔</span>
        <div style={{ fontSize: 12, fontWeight: 600 }}>Loo roll is low — added to the list</div>
      </div>
    </>
  )
}

function TasksP() {
  const days = [['Mon', 2], ['Tue', 3], ['Wed', 4], ['Thu', 5]] as const
  return (
    <>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {days.map(([d, n], k) => (
          <div key={k} style={{ flex: 1, textAlign: 'center', padding: '5px 0', borderRadius: 10, background: k === 2 ? TEAL : 'transparent', color: k === 2 ? '#fff' : '#56636E' }}>
            <div style={{ fontSize: 9, fontWeight: 600 }}>{d}</div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{n}</div>
          </div>
        ))}
      </div>
      <div style={{ ...card, overflow: 'hidden' }}>
        {[['◯', 'Service watermaker', false], ['◑', 'Rebuild winch', false], ['◯', 'Anchor-watch round', true]].map((r, k) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderTop: k ? '1px solid #E6EAEE' : 'none', borderLeft: r[2] ? `3px solid ${TEAL}` : '3px solid transparent' }}>
            <span style={{ color: TEAL, fontSize: 16 }}>{r[0]}</span>
            <div style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{r[1]}</div>
            {r[2] ? <span style={{ fontSize: 11 }}>🌙</span> : null}
          </div>
        ))}
      </div>
    </>
  )
}

function HoursP() {
  return (
    <>
      <PHead>Crew · this week</PHead>
      <div style={{ ...card, overflow: 'hidden' }}>
        {[['Sam', '38h work · 49h sleep', true], ['Jared', '96h work · 31h sleep', false]].map((r, k) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px', borderTop: k ? '1px solid #E6EAEE' : 'none' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r[0]}</div>
              <div style={muted}>{r[1]}</div>
            </div>
            {r[2]
              ? <span style={{ fontSize: 11, fontWeight: 700, color: '#1FA463' }}>✓ OK</span>
              : <span style={{ fontSize: 11, fontWeight: 700, color: '#E0922F' }}>⚠ 1</span>}
          </div>
        ))}
      </div>
      <div style={{ ...muted, marginTop: 7, textAlign: 'center' }}>MLC: ≤14h work/day · ≤91h/week</div>
    </>
  )
}

const fieldLabel: React.CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: '#8A96A0', marginBottom: 3 }
const fieldBox: React.CSSProperties = { background: '#fff', border: '1px solid #E6EAEE', borderRadius: 9, padding: '8px 9px', fontSize: 12, fontWeight: 600 }
function ItemP() {
  return (
    <>
      <PHead>New item</PHead>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div><div style={fieldLabel}>Name</div><div style={fieldBox}>Heineken 330ml</div></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}><div style={fieldLabel}>Unit</div><div style={fieldBox}>Bottle</div></div>
          <div style={{ flex: 1 }}><div style={fieldLabel}>Price (R)</div><div style={fieldBox}>18.00</div></div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}><div style={fieldLabel}>Par level</div><div style={{ ...fieldBox, color: TEAL }}>24</div></div>
          <div style={{ flex: 1 }}><div style={fieldLabel}>Bought at</div><div style={fieldBox}>Makro</div></div>
        </div>
      </div>
    </>
  )
}

function CrewP() {
  const rows = [['Jared', 'Captain', '#0E8C9B'], ['Sam', 'Deckhand', '#56636E'], ['Mia', 'Engineer', '#6A4FB3']] as const
  return (
    <>
      <PHead>Crew</PHead>
      <div style={{ ...card, overflow: 'hidden' }}>
        {rows.map((r, k) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 11px', borderTop: k ? '1px solid #E6EAEE' : 'none' }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: r[2] as string, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{r[0][0]}</div>
            <div style={{ flex: 1, fontWeight: 600, fontSize: 13.5 }}>{r[0]}</div>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: r[2] as string, background: `color-mix(in srgb, ${r[2]} 13%, transparent)`, padding: '2px 8px', borderRadius: 7 }}>{r[1]}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function DataP() {
  const grid = [['Name', 'Unit', 'Par'], ['Heineken', 'Bottle', '24'], ['Loo roll', 'Roll', '12'], ['Diesel', 'Litre', '200']]
  return (
    <>
      <PHead>Import a spreadsheet</PHead>
      <div style={{ ...card, overflow: 'hidden', marginBottom: 8 }}>
        {grid.map((row, k) => (
          <div key={k} style={{ display: 'flex', borderTop: k ? '1px solid #EEF1F3' : 'none', background: k === 0 ? '#EEF1F3' : '#fff' }}>
            {row.map((c, j) => (
              <div key={j} style={{ flex: j === 0 ? 1.4 : 1, padding: '7px 9px', fontSize: 11.5, fontWeight: k === 0 ? 700 : 500, color: k === 0 ? '#56636E' : '#0B1722', borderLeft: j ? '1px solid #EEF1F3' : 'none', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{c}</div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ background: TEAL, color: '#fff', fontWeight: 700, fontSize: 12.5, padding: '8px 20px', borderRadius: 11 }}>↑ Import</div>
      </div>
    </>
  )
}

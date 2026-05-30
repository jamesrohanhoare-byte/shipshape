import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Anchor, Package, TriangleAlert, Users, FileUp, Smartphone, Share, Plus, Check,
  ArrowRight, ChevronLeft,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { canEditBoatSettings } from '@/lib/permissions'
import { usePWAInstall } from '@/hooks/usePWAInstall'

interface Step {
  icon: LucideIcon
  title: string
  body: string
  adminOnly?: boolean
  install?: boolean
}

export default function Onboarding({ onFinish }: { onFinish: () => void }) {
  const { profile, boat } = useAuth()
  const isAdmin = profile ? canEditBoatSettings(profile.role) : false
  const { state, platform, install } = usePWAInstall()

  const steps = useMemo<Step[]>(() => ([
    { icon: Anchor, title: `Welcome aboard, ${profile?.full_name?.split(' ')[0] ?? 'Captain'}`, body: `${boat?.name ?? 'Your boat'} is ready. Here's the 60-second tour of how ShipShape keeps your stock in order.` },
    { icon: Package, title: 'Track everything onboard', body: 'Every consumable — from champagne to cleaning cloths. Open the Stock tab, tap an item, and log what you use or add. It all records who did what, when.' },
    { icon: TriangleAlert, title: 'Par levels do the watching', body: 'Give each item a par level. The moment stock drops to it, the item lands on the Shopping tab automatically and the captain & manager get a heads-up.' },
    { icon: Users, title: 'Add your crew', body: 'In Settings → Crew, add managers, deckhands and engineers. Each role sees exactly what they should — deckhands log usage, managers run stock, you run everything.', adminOnly: true },
    { icon: FileUp, title: 'Bring your existing stock', body: 'Already have a spreadsheet? Settings → Data → upload it. Only an item Name is required — price, unit and par are optional and matched automatically. Grab the template there too.', adminOnly: true },
    { icon: Smartphone, title: 'Add it to your Home Screen', body: 'Install ShipShape so it runs full-screen like a real app — and so push alerts work on iPhone.', install: true },
  ]).filter(s => !s.adminOnly || isAdmin), [profile, boat, isAdmin])

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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 22 }}>
              <div style={{ width: 84, height: 84, borderRadius: 24, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.22)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <step.icon size={40} color="#fff" strokeWidth={2.2} />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>{step.title}</h1>
                <p style={{ margin: '14px 0 0', fontSize: 16.5, lineHeight: 1.55, color: 'rgba(255,255,255,0.85)' }}>{step.body}</p>
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

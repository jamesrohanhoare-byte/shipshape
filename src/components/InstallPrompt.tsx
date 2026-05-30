import { useEffect, useState } from 'react'
import { Share, Plus, Anchor } from 'lucide-react'
import Sheet from './Sheet'
import { usePWAInstall } from '@/hooks/usePWAInstall'

const DISMISS_KEY = 'pwa_prompted'

/** One-time, auto-surfacing install nudge. Manual install also lives in Settings. */
export default function InstallPrompt() {
  const { state, install } = usePWAInstall()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return
    if (state === 'android' || state === 'ios') {
      const t = setTimeout(() => setOpen(true), 1800)
      return () => clearTimeout(t)
    }
  }, [state])

  const dismiss = () => { localStorage.setItem(DISMISS_KEY, '1'); setOpen(false) }
  const handleInstall = async () => { await install(); dismiss() }

  return (
    <Sheet open={open} onClose={dismiss} maxHeight="auto">
      <div style={{ padding: '4px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 15, background: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Anchor size={28} color="#fff" strokeWidth={2.4} />
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>Add ShipShape to your Home Screen</div>
            <div style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', marginTop: 3 }}>Full screen · Works offline-tolerant · Push alerts</div>
          </div>
        </div>

        {state === 'android' ? (
          <button onClick={handleInstall} className="btn btn-primary btn-block" style={{ fontSize: 16, height: 52 }}>
            Install App
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Step n={1} color="var(--color-info)" text="Tap the Share button" hint="At the bottom of Safari" icon={<Share size={14} color="var(--color-info)" />} />
            <Step n={2} color="var(--color-success)" text="Tap Add to Home Screen" hint="Scroll down to find it" icon={<Plus size={14} color="var(--color-success)" />} />
          </div>
        )}

        <button onClick={dismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: 'var(--color-text-tertiary)', padding: '16px 0 6px', textAlign: 'center', width: '100%', fontWeight: 500 }}>
          Maybe later
        </button>
      </div>
    </Sheet>
  )
}

function Step({ n, color, text, hint, icon }: { n: number; color: string; text: string; hint: string; icon: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--color-sunken)', borderRadius: 14, padding: '13px 15px' }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800, fontSize: 14, color }}>{n}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>{text} {icon}</div>
        <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', marginTop: 1 }}>{hint}</div>
      </div>
    </div>
  )
}

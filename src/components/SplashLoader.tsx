import { Anchor } from 'lucide-react'

export default function SplashLoader() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, background: 'var(--color-base)' }}>
      <div style={{
        width: 64, height: 64, borderRadius: 18, background: 'var(--color-accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 10px 30px -8px var(--color-accent-dim)',
        animation: 'pulse 1.6s ease-in-out infinite',
      }}>
        <Anchor size={30} color="#fff" strokeWidth={2.4} />
      </div>
      <div style={{ fontSize: 15, color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '-0.01em' }}>ShipShape</div>
      <style>{`@keyframes pulse { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(0.92); opacity: 0.7 } }`}</style>
    </div>
  )
}

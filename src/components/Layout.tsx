import BottomNav from './BottomNav'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-base)', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top)' }}>
      <main style={{ flex: 1, paddingBottom: 'calc(78px + env(safe-area-inset-bottom))' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', width: '100%' }}>
          {children}
        </div>
      </main>
      <BottomNav />
    </div>
  )
}

import type { LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  title: string
  message?: string
  action?: React.ReactNode
}

export default function EmptyState({ icon: Icon, title, message, action }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '56px 32px', gap: 8 }}>
      <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
        <Icon size={30} style={{ color: 'var(--color-accent)' }} strokeWidth={2} />
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</div>
      {message && <div style={{ fontSize: 14.5, color: 'var(--color-text-secondary)', maxWidth: 280, lineHeight: 1.5 }}>{message}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  )
}

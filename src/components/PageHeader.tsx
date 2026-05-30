interface Props {
  title: string
  subtitle?: string
  action?: React.ReactNode
}

/** Large iOS-style page title with an optional trailing action. */
export default function PageHeader({ title, subtitle, action }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, padding: '14px 20px 10px' }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>{title}</h1>
        {subtitle && (
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginTop: 4 }}>{subtitle}</div>
        )}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  )
}

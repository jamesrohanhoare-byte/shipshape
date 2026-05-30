import { NavLink, useLocation } from 'react-router-dom'
import { Home, Package, ShoppingCart, ListChecks, MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import MoreSheet from './MoreSheet'

const tabs = [
  { to: '/',         icon: Home,         label: 'Home', exact: true },
  { to: '/stock',    icon: Package,      label: 'Stock' },
  { to: '/shopping', icon: ShoppingCart, label: 'Shopping' },
  { to: '/tasks',    icon: ListChecks,   label: 'Tasks' },
]

// Routes that live inside the More sheet — keep the More tab highlighted on them
const moreRoutes = ['/settings', '/reports', '/sleep', '/crew']

export default function BottomNav() {
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const isMore = moreRoutes.some(p => location.pathname.startsWith(p))

  return (
    <>
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: 'var(--color-frosted)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        borderTop: '1px solid var(--color-divider)',
        display: 'flex',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {tabs.map(({ to, icon: Icon, label, exact }) => {
          const active = exact ? location.pathname === to : location.pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 4, padding: '9px 0 7px',
                color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                textDecoration: 'none', fontSize: 10.5, fontWeight: 600, letterSpacing: '-0.01em',
                transition: 'color 0.15s',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <Icon size={24} strokeWidth={active ? 2.5 : 2} />
              {label}
            </NavLink>
          )
        })}

        <button
          onClick={() => setMoreOpen(true)}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 4, padding: '9px 0 7px',
            color: isMore || moreOpen ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 10.5, fontWeight: 600, letterSpacing: '-0.01em',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <MoreHorizontal size={24} strokeWidth={isMore || moreOpen ? 2.5 : 2} />
          More
        </button>
      </nav>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  )
}

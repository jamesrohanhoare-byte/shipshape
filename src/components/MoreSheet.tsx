import { useNavigate } from 'react-router-dom'
import { Settings, BarChart3, Moon, Users, LogOut, ChevronRight, Anchor } from 'lucide-react'
import Sheet from './Sheet'
import { useAuth } from '@/context/AuthContext'
import { canViewReports, canManageCrew, ROLE_LABELS } from '@/lib/permissions'
import { initials } from '@/lib/formatters'
import { APP_VERSION } from '@/lib/version'

export default function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { profile, boat, signOut } = useAuth()
  if (!profile) return null

  const go = (path: string) => { onClose(); navigate(path) }

  const items = [
    { icon: Settings, label: 'Settings', sub: 'Boat config, branding, crew', path: '/settings', show: true },
    { icon: BarChart3, label: 'Reports', sub: 'Usage & cost', path: '/reports', show: canViewReports(profile.role) },
    { icon: Moon, label: 'Sleep Log', sub: 'Track your rest', path: '/sleep', show: true },
    { icon: Users, label: 'Crew', sub: 'Manage the team', path: '/crew', show: canManageCrew(profile.role) },
  ].filter(i => i.show)

  return (
    <Sheet open={open} onClose={onClose} maxHeight="80vh">
      {/* Boat identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 20px 20px' }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, flexShrink: 0,
          background: boat?.logo_url ? `center/cover no-repeat url(${boat.logo_url})` : 'var(--color-accent-dim)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {!boat?.logo_url && <Anchor size={24} style={{ color: 'var(--color-accent)' }} />}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {boat?.name ?? 'My Boat'}
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--color-text-secondary)' }}>
            {profile.full_name} · {ROLE_LABELS[profile.role]}
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>
        <div className="list-group">
          {items.map(({ icon: Icon, label, sub, path }) => (
            <button key={path} className="list-row" onClick={() => go(path)}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--color-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={18} style={{ color: 'var(--color-accent)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>{sub}</div>
              </div>
              <ChevronRight size={18} style={{ color: 'var(--color-text-faint)' }} />
            </button>
          ))}
        </div>

        <button
          className="list-group"
          onClick={() => { onClose(); signOut() }}
          style={{ marginTop: 14, marginBottom: 8, width: '100%' }}
        >
          <div className="list-row" style={{ color: 'var(--color-danger)' }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--color-danger-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <LogOut size={18} style={{ color: 'var(--color-danger)' }} />
            </div>
            <span style={{ flex: 1, fontWeight: 600 }}>Sign out</span>
            <span style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>{initials(profile.full_name)}</span>
          </div>
        </button>

        <div style={{ textAlign: 'center', padding: '10px 0 4px', fontSize: 12.5, color: 'var(--color-text-faint)', fontWeight: 600 }}>
          ShipShape v{APP_VERSION}
        </div>
      </div>
    </Sheet>
  )
}

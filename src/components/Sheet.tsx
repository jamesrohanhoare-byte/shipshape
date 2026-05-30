import { motion, AnimatePresence, type PanInfo } from 'framer-motion'
import { useEffect } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  /** max height as a vh fraction string, e.g. '85vh' */
  maxHeight?: string
}

/**
 * iOS-style bottom sheet: spring entrance, a grab handle, and drag-to-dismiss.
 * Theme-aware (uses design-system CSS vars). Reused for the More menu, the
 * add/deduct quantity sheet, pickers, etc.
 */
export default function Sheet({ open, onClose, title, children, maxHeight = '88vh' }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 700) onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={handleDragEnd}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 81,
              background: 'color-mix(in srgb, var(--color-surface) 86%, transparent)',
              backdropFilter: 'blur(30px) saturate(180%)',
              WebkitBackdropFilter: 'blur(30px) saturate(180%)',
              borderTop: '1px solid color-mix(in srgb, var(--color-surface) 40%, var(--color-border))',
              borderRadius: '22px 22px 0 0',
              maxHeight, display: 'flex', flexDirection: 'column',
              boxShadow: '0 -10px 40px -10px rgba(0,0,0,0.25)',
              touchAction: 'none',
            }}
          >
            {/* Grab handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px', flexShrink: 0 }}>
              <div style={{ width: 38, height: 5, borderRadius: 3, background: 'var(--color-text-faint)' }} />
            </div>

            {title && (
              <div style={{ padding: '10px 20px 14px', flexShrink: 0 }}>
                <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</span>
              </div>
            )}

            <div
              style={{ overflowY: 'auto', flex: 1, paddingBottom: 'calc(20px + env(safe-area-inset-bottom))', touchAction: 'pan-y' }}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

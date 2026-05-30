/**
 * Branding/theme application. The boat's accent colour and theme mode are
 * applied to <html> at runtime; the design system's CSS variables (and the
 * color-mix-derived shades) recompute automatically.
 */

export type ThemeMode = 'light' | 'dark' | 'auto'

const DEFAULT_ACCENT = '#0E7490'

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyThemeMode(mode: ThemeMode | null | undefined) {
  const resolved = mode === 'auto' || !mode ? (prefersDark() ? 'dark' : 'light') : mode
  document.documentElement.setAttribute('data-theme', resolved)
  // Keep the browser/PWA chrome colour in step
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#000000' : '#F2F2F7')
}

export function applyAccent(hex: string | null | undefined) {
  document.documentElement.style.setProperty('--color-accent', hex || DEFAULT_ACCENT)
}

/** Apply both at once (called when the boat profile loads / branding changes). */
export function applyBranding(opts: { accent?: string | null; mode?: ThemeMode | null }) {
  applyAccent(opts.accent)
  applyThemeMode(opts.mode)
}

/** Read the early-applied values from localStorage to avoid a flash on boot. */
export function bootBranding() {
  const accent = localStorage.getItem('boat_accent')
  const mode = localStorage.getItem('boat_theme') as ThemeMode | null
  applyAccent(accent)
  applyThemeMode(mode)
}

export function cacheBranding(accent?: string | null, mode?: ThemeMode | null) {
  if (accent) localStorage.setItem('boat_accent', accent)
  if (mode) localStorage.setItem('boat_theme', mode)
}

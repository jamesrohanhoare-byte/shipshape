import { useState, useEffect } from 'react'

export type PWAInstallState =
  | 'standalone'   // already installed — running as PWA
  | 'android'      // Android/desktop Chrome: can fire native install dialog
  | 'ios'          // iOS Safari: show manual instructions
  | 'unsupported'  // unsupported browser

export type PWAPlatform = 'ios' | 'android' | 'other'

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !('MSStream' in window)
}

function getPlatform(): PWAPlatform {
  if (isIOS()) return 'ios'
  if (/android/i.test(navigator.userAgent)) return 'android'
  return 'other'
}

export function usePWAInstall() {
  const [state, setState] = useState<PWAInstallState>('unsupported')
  const [deferredPrompt, setDeferredPrompt] = useState<(Event & { prompt: () => void; userChoice: Promise<unknown> }) | null>(null)
  const platform = getPlatform()

  useEffect(() => {
    if (isStandalone()) { setState('standalone'); return }
    if (isIOS()) { setState('ios'); return }

    const captured = (window as unknown as { __pwaPrompt?: Event }).__pwaPrompt
    if (captured) {
      setDeferredPrompt(captured as never)
      setState('android')
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      ;(window as unknown as { __pwaPrompt?: Event }).__pwaPrompt = e
      setDeferredPrompt(e as never)
      setState('android')
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const install = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      await deferredPrompt.userChoice
      setDeferredPrompt(null)
    }
  }

  return { state, platform, canInstall: deferredPrompt !== null, install }
}

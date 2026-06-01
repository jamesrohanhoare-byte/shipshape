import OneSignal from 'react-onesignal'

const APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID as string | undefined

export function pushConfigured(): boolean {
  return !!APP_ID
}

/** Whether this device has already granted notification permission.
 *  Source of truth is the browser's own permission, so it survives reloads —
 *  the Settings toggle reads this on mount instead of resetting to "Enable". */
export function pushPermissionGranted(): boolean {
  try {
    return typeof Notification !== 'undefined' && Notification.permission === 'granted'
  } catch {
    return false
  }
}

/** Ask the browser/OS for push permission — wired to the Settings toggle. */
export async function requestPushPermission(): Promise<boolean> {
  if (!APP_ID) return false
  try {
    await OneSignal.Notifications.requestPermission()
    return OneSignal.Notifications.permission
  } catch {
    return false
  }
}

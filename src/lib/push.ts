import OneSignal from 'react-onesignal'

const APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID as string | undefined

export function pushConfigured(): boolean {
  return !!APP_ID
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

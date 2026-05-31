import { useEffect } from 'react'
import OneSignal from 'react-onesignal'
import { useAuth } from '@/context/AuthContext'

const APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID as string | undefined

let initialised = false

/**
 * Initialises OneSignal once and tags the device with the user's boat + role so
 * low-stock pushes can target captains/managers of a specific boat.
 * No-ops silently if no app id is configured (e.g. local dev).
 */
export default function OneSignalInit() {
  const { profile } = useAuth()

  useEffect(() => {
    if (!APP_ID || !profile) return
    let cancelled = false

    async function setup() {
      try {
        if (!initialised) {
          await OneSignal.init({ appId: APP_ID!, allowLocalhostAsSecureOrigin: true })
          initialised = true
        }
        if (cancelled) return
        // Tie this subscription to the user and tag for targeting
        await OneSignal.login(profile!.id)
        await OneSignal.User.addTags({
          boat_id: profile!.boat_id,
          role: profile!.role,
        })
      } catch (err) {
        console.warn('OneSignal init skipped:', err)
      }
    }

    setup()
    return () => { cancelled = true }
  }, [profile])

  return null
}

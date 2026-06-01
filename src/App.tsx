import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import Layout from '@/components/Layout'
import InstallPrompt from '@/components/InstallPrompt'
import OneSignalInit from '@/components/OneSignalInit'
import SplashLoader from '@/components/SplashLoader'
import Onboarding from '@/components/Onboarding'

import Auth from '@/pages/Auth'
import Home from '@/pages/Home'
import Stock from '@/pages/Stock'
import Shopping from '@/pages/Shopping'
import Tasks from '@/pages/Tasks'
import Settings from '@/pages/Settings'
import Crew from '@/pages/Crew'
import Reports from '@/pages/Reports'
import Hours from '@/pages/Hours'

function Gate() {
  const { session, profile, loading, refresh } = useAuth()

  if (loading) return <SplashLoader />
  if (!session) return <Auth />
  // Signed in but no profile yet (mid-provision / orphaned) — Auth handles boat setup
  if (!profile) return <Auth />

  async function finishOnboarding() {
    if (!profile) return
    await supabase.from('profiles').update({ onboarded: true }).eq('id', profile.id)
    await refresh()
  }

  return (
    <>
      <OneSignalInit />
      {profile.onboarded && <InstallPrompt />}
      {!profile.onboarded && <Onboarding onFinish={finishOnboarding} />}
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/stock" element={<Stock />} />
          <Route path="/shopping" element={<Shopping />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/crew" element={<Crew />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/hours" element={<Hours />} />
          <Route path="/sleep" element={<Navigate to="/hours" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  )
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import Layout from '@/components/Layout'
import InstallPrompt from '@/components/InstallPrompt'
import OneSignalInit from '@/components/OneSignalInit'
import SplashLoader from '@/components/SplashLoader'

import Auth from '@/pages/Auth'
import Home from '@/pages/Home'
import Stock from '@/pages/Stock'
import Shopping from '@/pages/Shopping'
import Tasks from '@/pages/Tasks'
import Settings from '@/pages/Settings'
import Crew from '@/pages/Crew'
import Reports from '@/pages/Reports'
import Sleep from '@/pages/Sleep'

function Gate() {
  const { session, profile, loading } = useAuth()

  if (loading) return <SplashLoader />
  if (!session) return <Auth />
  // Signed in but no profile yet (mid-provision / orphaned) — Auth handles boat setup
  if (!profile) return <Auth />

  return (
    <>
      <OneSignalInit />
      <InstallPrompt />
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/stock" element={<Stock />} />
          <Route path="/shopping" element={<Shopping />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/crew" element={<Crew />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/sleep" element={<Sleep />} />
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

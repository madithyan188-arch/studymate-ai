'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { AuthScreen, AuthMode } from '@/components/auth-screens'

export default function ForgotPage() {
  const router = useRouter()

  const handleModeChange = (newMode: AuthMode) => {
    if (newMode === 'login') router.push('/login')
    else if (newMode === 'signup') router.push('/signup')
    else if (newMode === 'forgot') router.push('/forgot-password')
    else if (newMode === 'reset') router.push('/reset-password')
  }

  return (
    <AuthScreen
      initialMode="forgot"
      onNavigateToWorkspace={() => router.push('/')}
      onModeChange={handleModeChange}
    />
  )
}

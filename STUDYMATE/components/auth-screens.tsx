'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Sparkles,
  User,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  BookOpen,
  KeyRound,
  RotateCcw,
  Info,
  X,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage, Language, SUPPORTED_LANGUAGES } from '@/lib/i18n'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'

export type AuthMode = 'login' | 'signup' | 'forgot' | 'reset'

interface AuthScreensProps {
  initialMode?: AuthMode
  onNavigateToWorkspace: () => void
  onModeChange?: (mode: AuthMode) => void
}

function GoogleIcon({ className = 'size-[18px]' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.15z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  )
}

export function AuthScreen({
  initialMode = 'login',
  onNavigateToWorkspace,
  onModeChange,
}: AuthScreensProps) {
  const { t, language, setLanguage } = useLanguage()
  const [mode, setMode] = useState<AuthMode>(initialMode)

  // Sync mode if initialMode prop updates
  useEffect(() => {
    setMode(initialMode)
    setErrors({})
    setTouched({})
    setSubmittedMessage(null)
    setGoogleNotice(null)
  }, [initialMode])

  // Form states - all empty by default (never prefilled)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)

  // Interaction tracking for improved validation timing
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  // UI states
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [submittedMessage, setSubmittedMessage] = useState<{
    title: string
    description: string
    actionText?: string
    actionTarget?: AuthMode
  } | null>(null)
  const [googleNotice, setGoogleNotice] = useState<string | null>(null)
  const [googleError, setGoogleError] = useState<string | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Check URL parameters for OAuth errors returned from the redirect callback
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const err = params.get('error')
      const desc = params.get('error_description')
      if (err) {
        setGoogleError(desc || `Google authentication error: ${err}`)
      }
    }
  }, [])

  const handleGoogleSignIn = async () => {
    setGoogleError(null)
    setGoogleNotice(null)

    if (!isSupabaseConfigured()) {
      setGoogleNotice(
        'Supabase is partially configured with Project URL. Please ensure NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local has your complete Supabase anon/publishable key.'
      )
      return
    }

    try {
      setGoogleLoading(true)
      const supabase = createClient()
      const redirectTo = `${window.location.origin}/auth/callback?next=/`
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      })

      if (error) {
        setGoogleError(error.message)
        setGoogleLoading(false)
      }
    } catch (err: any) {
      setGoogleError(err?.message || 'An unexpected error occurred during Google Sign-In.')
      setGoogleLoading(false)
    }
  }

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode)
    setErrors({})
    setTouched({})
    setSubmittedMessage(null)
    setGoogleNotice(null)
    setGoogleError(null)
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setShowConfirmPassword(false)
    onModeChange?.(newMode)
  }

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    let score = 0
    if (pass.length >= 8) score++
    if (/[A-Z]/.test(pass)) score++
    if (/[0-9]/.test(pass)) score++
    if (/[^A-Za-z0-9]/.test(pass)) score++
    return score
  }

  const validateEmailFormat = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())
  }

  // Single source of truth for validation rules
  const getFieldError = (
    field: 'name' | 'email' | 'password' | 'confirmPassword' | 'terms',
    overrideValues?: {
      name?: string
      email?: string
      password?: string
      confirmPassword?: string
      agreeTerms?: boolean
      mode?: AuthMode
    }
  ): string | null => {
    const activeMode = overrideValues?.mode ?? mode
    const curName = overrideValues?.name !== undefined ? overrideValues.name : name
    const curEmail = overrideValues?.email !== undefined ? overrideValues.email : email
    const curPassword = overrideValues?.password !== undefined ? overrideValues.password : password
    const curConfirm = overrideValues?.confirmPassword !== undefined ? overrideValues.confirmPassword : confirmPassword
    const curTerms = overrideValues?.agreeTerms !== undefined ? overrideValues.agreeTerms : agreeTerms

    if (field === 'name' && activeMode === 'signup') {
      if (!curName.trim()) return t('authErrName')
      if (curName.trim().length < 2) return t('authErrName')
    }

    if (field === 'email' && activeMode !== 'reset') {
      if (!curEmail.trim()) return t('authErrEmail')
      if (!validateEmailFormat(curEmail)) return t('authErrEmailInvalid')
    }

    if (field === 'password' && activeMode !== 'forgot') {
      if (!curPassword) {
        return t('authErrPassword')
      }
      if (activeMode === 'login') {
        if (curPassword.length < 6) return t('authErrPasswordLength')
      } else {
        if (curPassword.length < 8) return t('authErrPasswordLength')
      }
    }

    if (field === 'confirmPassword' && (activeMode === 'signup' || activeMode === 'reset')) {
      if (!curConfirm) {
        return t('authErrConfirmPassword')
      }
      if (curConfirm !== curPassword) {
        return t('authErrPasswordMatch')
      }
    }

    if (field === 'terms' && activeMode === 'signup') {
      if (!curTerms) {
        return t('authErrTerms')
      }
    }

    return null
  }

  // Handle onBlur to trigger required-field validation after a user leaves the field
  const handleBlur = (field: 'name' | 'email' | 'password' | 'confirmPassword' | 'terms') => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    const errorMsg = getFieldError(field)
    setErrors((prev) => {
      const next = { ...prev }
      if (errorMsg) {
        next[field] = errorMsg
      } else {
        delete next[field]
      }
      return next
    })
  }

  // Field change handlers: clear errors when corrected, or update error if touched
  const handleNameChange = (val: string) => {
    setName(val)
    if (touched.name || errors.name) {
      const err = getFieldError('name', { name: val })
      setErrors((prev) => {
        const next = { ...prev }
        if (err) next.name = err
        else delete next.name
        return next
      })
    }
  }

  const handleEmailChange = (val: string) => {
    setEmail(val)
    if (touched.email || errors.email) {
      const err = getFieldError('email', { email: val })
      setErrors((prev) => {
        const next = { ...prev }
        if (err) next.email = err
        else delete next.email
        return next
      })
    }
  }

  const handlePasswordChange = (val: string) => {
    setPassword(val)
    if (touched.password || errors.password) {
      const err = getFieldError('password', { password: val })
      setErrors((prev) => {
        const next = { ...prev }
        if (err) next.password = err
        else delete next.password
        return next
      })
    }
    // Also re-validate confirm password if it has already been touched
    if ((touched.confirmPassword || errors.confirmPassword) && confirmPassword) {
      const confirmErr = getFieldError('confirmPassword', { password: val, confirmPassword })
      setErrors((prev) => {
        const next = { ...prev }
        if (confirmErr) next.confirmPassword = confirmErr
        else delete next.confirmPassword
        return next
      })
    }
  }

  const handleConfirmPasswordChange = (val: string) => {
    setConfirmPassword(val)
    if (touched.confirmPassword || errors.confirmPassword) {
      const err = getFieldError('confirmPassword', { confirmPassword: val })
      setErrors((prev) => {
        const next = { ...prev }
        if (err) next.confirmPassword = err
        else delete next.confirmPassword
        return next
      })
    }
  }

  const handleTermsChange = (checked: boolean) => {
    setAgreeTerms(checked)
    if (touched.terms || errors.terms) {
      const err = getFieldError('terms', { agreeTerms: checked })
      setErrors((prev) => {
        const next = { ...prev }
        if (err) next.terms = err
        else delete next.terms
        return next
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setGoogleNotice(null)

    // Mark all relevant fields for current mode as touched
    const touchedFields: Record<string, boolean> = {
      email: mode !== 'reset',
      password: mode !== 'forgot',
      name: mode === 'signup',
      confirmPassword: mode === 'signup' || mode === 'reset',
      terms: mode === 'signup',
    }
    setTouched((prev) => ({ ...prev, ...touchedFields }))

    const newErrors: Record<string, string> = {}

    if (mode === 'login') {
      const errEmail = getFieldError('email')
      if (errEmail) newErrors.email = errEmail

      const errPass = getFieldError('password')
      if (errPass) newErrors.password = errPass

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors)
        return
      }

      setErrors({})
      setIsSubmitting(true)
      try {
        if (!isSupabaseConfigured()) {
          setSubmittedMessage({
            title: 'Supabase Not Configured',
            description: 'Authentication requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
          })
          return
        }
        const supabase = createClient()
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) {
          setErrors({ form: error.message })
          return
        }
        if (data?.session) {
          onNavigateToWorkspace()
        }
      } catch (err: any) {
        setErrors({ form: err?.message || 'Failed to sign in. Please check your credentials.' })
      } finally {
        setIsSubmitting(false)
      }
    } else if (mode === 'signup') {
      const errName = getFieldError('name')
      if (errName) newErrors.name = errName

      const errEmail = getFieldError('email')
      if (errEmail) newErrors.email = errEmail

      const errPass = getFieldError('password')
      if (errPass) newErrors.password = errPass

      const errConfirm = getFieldError('confirmPassword')
      if (errConfirm) newErrors.confirmPassword = errConfirm

      const errTerms = getFieldError('terms')
      if (errTerms) newErrors.terms = errTerms

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors)
        return
      }

      setErrors({})
      setIsSubmitting(true)
      try {
        if (!isSupabaseConfigured()) {
          setSubmittedMessage({
            title: 'Supabase Not Configured',
            description: 'Authentication requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
          })
          return
        }
        const supabase = createClient()
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: name.trim(),
            },
            emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined,
          },
        })
        if (error) {
          setErrors({ form: error.message })
          return
        }
        if (data?.session) {
          onNavigateToWorkspace()
        } else {
          setSubmittedMessage({
            title: 'Registration Successful',
            description: `Account created for ${email}. If your Supabase project requires email confirmation, please check your inbox to activate your account.`,
            actionText: 'Proceed to Sign In view',
            actionTarget: 'login',
          })
        }
      } catch (err: any) {
        setErrors({ form: err?.message || 'Failed to create account.' })
      } finally {
        setIsSubmitting(false)
      }
    } else if (mode === 'forgot') {
      const errEmail = getFieldError('email')
      if (errEmail) newErrors.email = errEmail

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors)
        return
      }

      setErrors({})
      setIsSubmitting(true)
      try {
        if (!isSupabaseConfigured()) {
          setSubmittedMessage({
            title: 'Supabase Not Configured',
            description: 'Authentication requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
          })
          return
        }
        const supabase = createClient()
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined,
        })
        if (error) {
          setErrors({ form: error.message })
          return
        }
        setSubmittedMessage({
          title: 'Reset Instructions Dispatched',
          description: 'A password reset link has been dispatched to ' + email + '. Please check your inbox and click the link to proceed.',
          actionText: 'Return to Sign In view',
          actionTarget: 'login',
        })
      } catch (err: any) {
        setErrors({ form: err?.message || 'Failed to dispatch reset email.' })
      } finally {
        setIsSubmitting(false)
      }
    } else if (mode === 'reset') {
      const errPass = getFieldError('password')
      if (errPass) newErrors.password = errPass

      const errConfirm = getFieldError('confirmPassword')
      if (errConfirm) newErrors.confirmPassword = errConfirm

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors)
        return
      }

      setErrors({})
      setIsSubmitting(true)
      try {
        if (!isSupabaseConfigured()) {
          setSubmittedMessage({
            title: 'Supabase Not Configured',
            description: 'Authentication requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
          })
          return
        }
        const supabase = createClient()
        const { error } = await supabase.auth.updateUser({
          password,
        })
        if (error) {
          setErrors({ form: error.message })
          return
        }
        setSubmittedMessage({
          title: 'Password Reset Successful',
          description: 'Your password has been securely updated. You can now sign in with your new credentials.',
          actionText: 'Return to Sign In',
          actionTarget: 'login',
        })
      } catch (err: any) {
        setErrors({ form: err?.message || 'Failed to update password.' })
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  const passStrength = getPasswordStrength(password)

  return (
    <div className="min-h-screen bg-[#f8f8f6] text-[#202337] flex flex-col selection:bg-[#4f5bd5]/15">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 flex h-16 md:h-[72px] items-center justify-between border-b border-[#e7e6e1] bg-[#f8f8f6]/95 px-4 sm:px-6 md:px-10 backdrop-blur shrink-0">
        <Link href="/" className="flex items-center gap-2.5 sm:gap-3 group">
          <div className="flex size-8 sm:size-9 items-center justify-center rounded-xl bg-[#4f5bd5] text-white shadow-sm transition group-hover:scale-105">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="font-semibold tracking-tight text-sm md:text-base leading-tight">
              StudyMate <span className="text-[#4f5bd5]">AI</span>
            </div>
            <div className="text-[10px] uppercase tracking-[.18em] text-[#8d8f9e] hidden sm:block">
              {t('brandTagline')}
            </div>
          </div>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Interface Language Selector */}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            aria-label={t('settingsLanguageLabel')}
            className="rounded-xl border border-[#deded9] bg-white px-2.5 py-1.5 sm:py-2 text-xs font-semibold text-[#4b4e60] shadow-sm outline-none hover:border-[#bfc3f1] focus:border-[#4f5bd5]"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onNavigateToWorkspace}
            className="flex items-center gap-1.5 sm:gap-2 rounded-xl border border-[#deded9] bg-white px-3 sm:px-3.5 py-1.5 sm:py-2 text-xs font-semibold text-[#4b4e60] shadow-sm transition hover:border-[#bfc3f1] hover:text-[#4f5bd5] shrink-0 whitespace-nowrap active:scale-[0.98]"
          >
            <ArrowLeft size={14} />
            <span>{t('back')}</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col justify-start lg:justify-center items-center px-4 py-6 sm:py-8 lg:py-10">
        <div className="w-full max-w-5xl my-auto grid lg:grid-cols-[1.12fr_0.88fr] gap-6 lg:gap-8 items-start">
          {/* Auth Card Container */}
          <div className="w-full rounded-2xl border border-[#e7e6e1] bg-white p-5 sm:p-7 md:p-8 shadow-[0_4px_20px_rgba(31,35,53,0.04)]">
            {/* Header Tabs for Sign In vs Sign Up */}
            {(mode === 'login' || mode === 'signup') && (
              <div className="mb-5 grid grid-cols-2 rounded-xl bg-[#f4f4f1] p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className={cn(
                    'rounded-lg py-2 transition-all text-center',
                    mode === 'login'
                      ? 'bg-white text-[#4f5bd5] shadow-sm font-bold'
                      : 'text-[#777989] hover:text-[#202337]'
                  )}
                >
                  {t('authBtnSignIn')}
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className={cn(
                    'rounded-lg py-2 transition-all text-center',
                    mode === 'signup'
                      ? 'bg-white text-[#4f5bd5] shadow-sm font-bold'
                      : 'text-[#777989] hover:text-[#202337]'
                  )}
                >
                  {t('authBtnCreateAccount')}
                </button>
              </div>
            )}

            {/* Back button for Forgot / Reset modes */}
            {(mode === 'forgot' || mode === 'reset') && (
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#4f5bd5] hover:underline"
              >
                <ArrowLeft size={13} /> {t('authBackToLogin')}
              </button>
            )}

            {/* Form Title & Description */}
            <div className="mb-5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#202337]">
                {mode === 'login' && t('authLoginHeading')}
                {mode === 'signup' && t('authSignupHeading')}
                {mode === 'forgot' && t('authForgotHeading')}
                {mode === 'reset' && t('authResetHeading')}
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-[#777989] leading-relaxed">
                {mode === 'login' && t('authLoginSubheading')}
                {mode === 'signup' && t('authSignupSubheading')}
                {mode === 'forgot' && t('authForgotSubheading')}
                {mode === 'reset' && t('authResetSubheading')}
              </p>
            </div>

            {/* Visual Feedback Banner */}
            {submittedMessage ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-[#b8dfce] bg-[#f0f9f4] p-4 sm:p-5 text-left">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 size={20} className="mt-0.5 text-[#2e7d56] shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-[#1f583d]">{submittedMessage.title}</h4>
                      <p className="mt-1.5 text-xs leading-relaxed text-[#2f674b]">
                        {submittedMessage.description}
                      </p>
                      <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-[#3b7e5e]">
                        <ShieldCheck size={14} /> UI Prototype: No real credentials were sent or stored.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2.5 pt-1">
                  {submittedMessage.actionTarget && submittedMessage.actionText && (
                    <button
                      type="button"
                      onClick={() => {
                        if (submittedMessage.actionTarget) switchMode(submittedMessage.actionTarget)
                      }}
                      className="rounded-xl bg-[#4f5bd5] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#434ec4] transition"
                    >
                      {submittedMessage.actionText}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onNavigateToWorkspace}
                    className="rounded-xl border border-[#deded9] bg-white px-4 py-2.5 text-xs font-semibold text-[#4b4e60] hover:border-[#bfc3f1] transition"
                  >
                    Enter Workspace Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubmittedMessage(null)}
                    className="rounded-xl px-3 py-2.5 text-xs font-medium text-[#777989] hover:text-[#202337]"
                  >
                    Modify Form
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="space-y-3.5 sm:space-y-4">
                {/* Google Sign In / Sign Up Option */}
                {(mode === 'login' || mode === 'signup') && (
                  <div className="space-y-3 pb-1">
                    <button
                      type="button"
                      disabled={googleLoading}
                      onClick={handleGoogleSignIn}
                      className="w-full h-10 sm:h-11 flex items-center justify-center gap-2.5 rounded-xl border border-[#deded9] bg-white px-4 text-xs sm:text-sm font-semibold text-[#202337] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-[#bfc3f1] hover:bg-[#fafafc] hover:text-[#181a27] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f5bd5]/20 focus-visible:border-[#4f5bd5] disabled:opacity-60 disabled:cursor-not-allowed"
                      aria-label={t('authGoogleBtn')}
                    >
                      {googleLoading ? (
                        <Loader2 size={18} className="animate-spin text-[#4f5bd5]" />
                      ) : (
                        <GoogleIcon className="size-[18px] shrink-0" />
                      )}
                      <span>{googleLoading ? t('loading') : t('authGoogleBtn')}</span>
                    </button>

                    {googleError && (
                      <div
                        role="alert"
                        aria-live="assertive"
                        className="rounded-xl border border-[#f5c6cb] bg-[#f8d7da] p-3 text-xs text-[#721c24] flex items-start justify-between gap-2 transition"
                      >
                        <div className="flex items-start gap-2">
                          <AlertCircle size={16} className="text-[#c82333] shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-[#721c24]">{googleError}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setGoogleError(null)}
                          className="text-[#721c24] hover:opacity-70 p-0.5 rounded transition"
                          aria-label="Dismiss error"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}

                    {googleNotice && (
                      <div
                        role="status"
                        aria-live="polite"
                        className="rounded-xl border border-[#d8daf8] bg-[#f2f4fd] p-3 text-xs text-[#3b449b] flex items-start justify-between gap-2 transition"
                      >
                        <div className="flex items-start gap-2">
                          <Info size={16} className="text-[#4f5bd5] shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-[#2f3885]">{googleNotice}</p>
                            <p className="mt-0.5 text-[11px] text-[#5c64b5]">
                              OAuth and account linking require valid Supabase credentials.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setGoogleNotice(null)}
                          className="text-[#5c64b5] hover:text-[#2f3885] p-0.5 rounded transition"
                          aria-label="Dismiss notification"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}

                    <div className="relative flex items-center justify-center pt-1">
                      <div className="absolute inset-0 flex items-center" aria-hidden="true">
                        <div className="w-full border-t border-[#e7e6e1]" />
                      </div>
                      <span className="relative bg-white px-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#9a9ba8]">
                        {t('authOrDivider')}
                      </span>
                    </div>
                  </div>
                )}

                {/* Full Name (Sign Up only) */}
                {mode === 'signup' && (
                  <div>
                    <label htmlFor="auth-name" className="block text-xs font-semibold text-[#333649] mb-1">
                      {t('authLabelName')}
                    </label>
                    <div className="relative">
                      <input
                        id="auth-name"
                        type="text"
                        autoComplete="name"
                        value={name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        onBlur={() => handleBlur('name')}
                        placeholder={t('authPlaceholderName')}
                        className={cn(
                          'w-full h-10 sm:h-11 rounded-xl border bg-[#fbfbfa] px-3.5 pl-10 text-sm outline-none transition',
                          errors.name
                            ? 'border-[#e26f61] bg-[#fffdfd] focus:ring-2 focus:ring-[#e26f61]/20'
                            : 'border-[#e4e4df] focus:border-[#4f5bd5] focus:bg-white focus:ring-2 focus:ring-[#4f5bd5]/10'
                        )}
                      />
                      <User size={16} className="absolute left-3.5 top-3 sm:top-3.5 text-[#9a9ba8]" />
                    </div>
                    {errors.name && (
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#cf4c3c] font-medium">
                        <AlertCircle size={12} className="shrink-0" /> {errors.name}
                      </p>
                    )}
                  </div>
                )}

                {/* Email Address (Login, Sign Up, Forgot) */}
                {mode !== 'reset' && (
                  <div>
                    <label htmlFor="auth-email" className="block text-xs font-semibold text-[#333649] mb-1">
                      {t('authLabelEmail')}
                    </label>
                    <div className="relative">
                      <input
                        id="auth-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => handleEmailChange(e.target.value)}
                        onBlur={() => handleBlur('email')}
                        placeholder={t('authPlaceholderEmail')}
                        className={cn(
                          'w-full h-10 sm:h-11 rounded-xl border bg-[#fbfbfa] px-3.5 pl-10 text-sm outline-none transition',
                          errors.email
                            ? 'border-[#e26f61] bg-[#fffdfd] focus:ring-2 focus:ring-[#e26f61]/20'
                            : 'border-[#e4e4df] focus:border-[#4f5bd5] focus:bg-white focus:ring-2 focus:ring-[#4f5bd5]/10'
                        )}
                      />
                      <Mail size={16} className="absolute left-3.5 top-3 sm:top-3.5 text-[#9a9ba8]" />
                    </div>
                    {errors.email && (
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#cf4c3c] font-medium">
                        <AlertCircle size={12} className="shrink-0" /> {errors.email}
                      </p>
                    )}
                  </div>
                )}

                {/* Password field (Login, Sign Up, Reset) */}
                {mode !== 'forgot' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="auth-password" className="text-xs font-semibold text-[#333649]">
                        {mode === 'reset' ? t('authResetHeading') : t('authLabelPassword')}
                      </label>
                      {mode === 'login' && (
                        <button
                          type="button"
                          onClick={() => switchMode('forgot')}
                          className="text-xs font-semibold text-[#4f5bd5] hover:underline"
                        >
                          {t('authForgotLink')}
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        id="auth-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        value={password}
                        onChange={(e) => handlePasswordChange(e.target.value)}
                        onBlur={() => handleBlur('password')}
                        placeholder={t('authPlaceholderPassword')}
                        className={cn(
                          'w-full h-10 sm:h-11 rounded-xl border bg-[#fbfbfa] px-3.5 pl-10 pr-10 text-sm outline-none transition',
                          errors.password
                            ? 'border-[#e26f61] bg-[#fffdfd] focus:ring-2 focus:ring-[#e26f61]/20'
                            : 'border-[#e4e4df] focus:border-[#4f5bd5] focus:bg-white focus:ring-2 focus:ring-[#4f5bd5]/10'
                        )}
                      />
                      <Lock size={16} className="absolute left-3.5 top-3 sm:top-3.5 text-[#9a9ba8]" />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-2.5 sm:top-3 p-0.5 text-[#9a9ba8] hover:text-[#4f5bd5] transition"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#cf4c3c] font-medium">
                        <AlertCircle size={12} className="shrink-0" /> {errors.password}
                      </p>
                    )}

                    {/* Password Strength Meter (Sign Up & Reset) */}
                    {(mode === 'signup' || mode === 'reset') && password.length > 0 && (
                      <div className="mt-2 space-y-1.5 rounded-lg bg-[#f9f9f7] p-2 sm:p-2.5 border border-[#ecece8]">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-[#777989]">Password strength:</span>
                          <span
                            className={cn(
                              'font-semibold',
                              passStrength <= 1 && 'text-[#cf4c3c]',
                              passStrength === 2 && 'text-[#d28a55]',
                              passStrength >= 3 && 'text-[#2e7d56]'
                            )}
                          >
                            {passStrength <= 1 && 'Weak'}
                            {passStrength === 2 && 'Fair'}
                            {passStrength >= 3 && 'Strong'}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-1 h-1.5">
                          <div
                            className={cn(
                              'rounded-full',
                              passStrength >= 1
                                ? passStrength === 1
                                  ? 'bg-[#cf4c3c]'
                                  : passStrength === 2
                                  ? 'bg-[#d28a55]'
                                  : 'bg-[#2e7d56]'
                                : 'bg-[#deded9]'
                            )}
                          />
                          <div
                            className={cn(
                              'rounded-full',
                              passStrength >= 2
                                ? passStrength === 2
                                  ? 'bg-[#d28a55]'
                                  : 'bg-[#2e7d56]'
                                : 'bg-[#deded9]'
                            )}
                          />
                          <div
                            className={cn('rounded-full', passStrength >= 3 ? 'bg-[#2e7d56]' : 'bg-[#deded9]')}
                          />
                          <div
                            className={cn('rounded-full', passStrength >= 4 ? 'bg-[#2e7d56]' : 'bg-[#deded9]')}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Confirm Password (Sign Up & Reset) */}
                {(mode === 'signup' || mode === 'reset') && (
                  <div>
                    <label htmlFor="auth-confirm-password" className="block text-xs font-semibold text-[#333649] mb-1">
                      {t('authLabelConfirmPassword')}
                    </label>
                    <div className="relative">
                      <input
                        id="auth-confirm-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => handleConfirmPasswordChange(e.target.value)}
                        onBlur={() => handleBlur('confirmPassword')}
                        placeholder={t('authPlaceholderPassword')}
                        className={cn(
                          'w-full h-10 sm:h-11 rounded-xl border bg-[#fbfbfa] px-3.5 pl-10 pr-10 text-sm outline-none transition',
                          errors.confirmPassword
                            ? 'border-[#e26f61] bg-[#fffdfd] focus:ring-2 focus:ring-[#e26f61]/20'
                            : 'border-[#e4e4df] focus:border-[#4f5bd5] focus:bg-white focus:ring-2 focus:ring-[#4f5bd5]/10'
                        )}
                      />
                      <KeyRound size={16} className="absolute left-3.5 top-3 sm:top-3.5 text-[#9a9ba8]" />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3.5 top-2.5 sm:top-3 p-0.5 text-[#9a9ba8] hover:text-[#4f5bd5] transition"
                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#cf4c3c] font-medium">
                        <AlertCircle size={12} className="shrink-0" /> {errors.confirmPassword}
                      </p>
                    )}
                  </div>
                )}

                {/* Remember Me / Terms Checkboxes */}
                {mode === 'login' && (
                  <div className="flex items-center justify-between pt-0.5">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-[#585a6b] select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="size-4 rounded accent-[#4f5bd5]"
                      />
                      <span>{t('authRememberMe')}</span>
                    </label>
                  </div>
                )}

                {mode === 'signup' && (
                  <div className="pt-0.5">
                    <label className="flex items-start gap-2 cursor-pointer text-xs text-[#585a6b] leading-tight select-none">
                      <input
                        type="checkbox"
                        checked={agreeTerms}
                        onChange={(e) => handleTermsChange(e.target.checked)}
                        className="size-4 rounded accent-[#4f5bd5] mt-0.5 shrink-0"
                      />
                      <span>
                        {t('authAgreeTerms')}{' '}
                        <Link
                          href="/terms"
                          className="font-semibold text-[#4f5bd5] underline decoration-[#4f5bd5]/30 underline-offset-2 hover:decoration-[#4f5bd5]"
                        >
                          {t('authTermsLink')}
                        </Link>{' '}
                        {t('authAndWord')}{' '}
                        <Link
                          href="/privacy"
                          className="font-semibold text-[#4f5bd5] underline decoration-[#4f5bd5]/30 underline-offset-2 hover:decoration-[#4f5bd5]"
                        >
                          {t('authPrivacyLink')}
                        </Link>
                        .
                      </span>
                    </label>
                    {errors.terms && (
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#cf4c3c] font-medium">
                        <AlertCircle size={12} className="shrink-0" /> {errors.terms}
                      </p>
                    )}
                  </div>
                )}

                {errors.form && (
                  <div
                    role="alert"
                    aria-live="assertive"
                    className="rounded-xl border border-[#f5c6cb] bg-[#f8d7da] p-3 text-xs text-[#721c24] flex items-start gap-2"
                  >
                    <AlertCircle size={16} className="text-[#c82333] shrink-0 mt-0.5" />
                    <p className="font-semibold">{errors.form}</p>
                  </div>
                )}

                {/* Primary Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-2 sm:mt-3 flex items-center justify-center gap-2 rounded-xl bg-[#4f5bd5] py-2.5 sm:py-3 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(79,91,213,0.24)] transition hover:bg-[#434ec4] hover:shadow-[0_6px_18px_rgba(79,91,213,0.3)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f5bd5] focus-visible:ring-offset-2 disabled:opacity-60 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>{t('loading')}</span>
                    </>
                  ) : (
                    <>
                      <span>
                        {mode === 'login' && t('authBtnSignIn')}
                        {mode === 'signup' && t('authBtnCreateAccount')}
                        {mode === 'forgot' && t('authBtnSendReset')}
                        {mode === 'reset' && t('authBtnUpdatePassword')}
                      </span>
                      <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>

                {/* Switch Mode Links */}
                <div className="mt-3 pt-3 text-center border-t border-[#efefec]">
                  {mode === 'login' && (
                    <p className="text-xs text-[#777989]">
                      {t('authNoAccount')}{' '}
                      <button
                        type="button"
                        onClick={() => switchMode('signup')}
                        className="font-bold text-[#4f5bd5] hover:underline"
                      >
                        {t('authLinkSignUp')}
                      </button>
                    </p>
                  )}
                  {mode === 'signup' && (
                    <p className="text-xs text-[#777989]">
                      {t('authHaveAccount')}{' '}
                      <button
                        type="button"
                        onClick={() => switchMode('login')}
                        className="font-bold text-[#4f5bd5] hover:underline"
                      >
                        {t('authLinkSignIn')}
                      </button>
                    </p>
                  )}
                  {(mode === 'forgot' || mode === 'reset') && (
                    <p className="text-xs text-[#777989]">
                      {t('authRememberPass')}{' '}
                      <button
                        type="button"
                        onClick={() => switchMode('login')}
                        className="font-bold text-[#4f5bd5] hover:underline"
                      >
                        {t('authBackToLogin')}
                      </button>
                    </p>
                  )}
                </div>
              </form>
            )}

            {/* Prototype Notice Footer */}
            <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-[#9a9ba8] border-t border-dashed border-[#e6e6e2] pt-3">
              <ShieldCheck size={13} className="text-[#888ca0] shrink-0" />
              <span>Frontend UI prototype &bull; Supabase Auth integration ready.</span>
            </div>
          </div>

          {/* Feature Showcase Column (Side-by-side on desktop, stacked below on tablet/mobile) */}
          <div className="flex flex-col gap-5 mt-6 lg:mt-0 w-full max-w-xl mx-auto lg:max-w-none">
            <div className="rounded-2xl border border-[#e7e6e1] bg-white p-5 sm:p-7 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#4f5bd5]">
                <BookOpen size={15} /> StudyMate Learning Loop
              </div>
              <h2 className="mt-2.5 text-xl sm:text-2xl font-bold tracking-tight text-[#202337]">
                From reading to true understanding.
              </h2>
              <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-[#777989]">
                Turn heavy PDFs and dense textbooks into organized notes, adaptive practice tests, and on-demand tutor explanations.
              </p>

              <div className="mt-5 space-y-3">
                <div className="flex items-center gap-3 rounded-xl bg-[#f8f8fb] p-3 border border-[#ededf8]">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#edeefd] text-[#4f5bd5]">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#202337]">AI Notes with Page Citations</div>
                    <div className="text-[11px] text-[#868898]">Key concepts extracted directly from your files.</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl bg-[#f7faf8] p-3 border border-[#e4f0e9]">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#e8f2ed] text-[#438568]">
                    <Check size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#202337]">Interactive Active Recall Quizzes</div>
                    <div className="text-[11px] text-[#868898]">Instant feedback with detailed rationales.</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl bg-[#fdfaf5] p-3 border border-[#f4ece0]">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#f2eddf] text-[#b98534]">
                    <RotateCcw size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#202337]">Targeted Revision Recommendations</div>
                    <div className="text-[11px] text-[#868898]">Spot weak topics before your exam day.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Testimonial / Quote Card */}
            <div className="rounded-2xl bg-gradient-to-br from-[#4f5bd5] to-[#3742b6] p-5 sm:p-6 text-white shadow-md">
              <div className="text-xs uppercase font-semibold tracking-wider text-indigo-200">
                Student Profile Preview
              </div>
              <p className="mt-2 text-xs sm:text-sm leading-relaxed text-indigo-50">
                &ldquo;StudyMate transformed how I prepare for exams. Having the AI tutor ground every answer in my own lecture slides makes all the difference.&rdquo;
              </p>
              <div className="mt-4 flex items-center gap-3 pt-3 border-t border-indigo-400/30">
                <div className="flex size-8 items-center justify-center rounded-full bg-[#f2c9a9] text-xs font-bold text-[#75472c]">
                  SM
                </div>
                <div>
                  <div className="text-xs font-semibold">Alex Morgan</div>
                  <div className="text-[10px] text-indigo-200">Biology Major &bull; StudyMate Beta</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 sm:py-5 text-center text-xs text-[#9a9ba8] border-t border-[#e7e6e1] bg-white shrink-0">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4">
          <span>StudyMate AI &copy; 2026 &bull; Designed for focused learning</span>
          <span className="hidden sm:inline">&bull;</span>
          <Link href="/terms" className="hover:text-[#4f5bd5] hover:underline transition">
            Terms of Service Preview
          </Link>
          <span>&bull;</span>
          <Link href="/privacy" className="hover:text-[#4f5bd5] hover:underline transition">
            Privacy Policy Preview
          </Link>
        </div>
      </footer>
    </div>
  )
}

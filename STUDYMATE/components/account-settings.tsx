'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import {
  LockKeyhole,
  LogOut,
  Mail,
  ShieldCheck,
  Trash2,
  KeyRound,
  ExternalLink,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { useLanguage } from '@/lib/i18n'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'

export function SettingGroup({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h3 className="font-semibold text-base text-[#202337] dark:text-white">{title}</h3>
      <div className="mt-5 flex flex-col gap-5">{children}</div>
    </div>
  )
}

export function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#efefec] dark:border-[#282a3e] pb-5">
      <div>
        <div className="text-sm font-semibold text-[#202337] dark:text-white">{label}</div>
        {description && <div className="mt-1 text-xs text-[#9293a0] dark:text-[#84879c]">{description}</div>}
      </div>
      {children}
    </div>
  )
}

export function ToggleRow({
  label,
  checked = false,
  onChange,
}: {
  label: string
  checked?: boolean
  onChange?: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between text-sm cursor-pointer select-none py-1.5 group">
      <span className="text-[#333649] dark:text-[#d0d3e5] font-medium group-hover:text-[#202337] dark:group-hover:text-white transition-colors">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          onChange?.(e.target.checked)
        }}
        className="size-4 accent-[#4f5bd5] rounded cursor-pointer"
      />
    </label>
  )
}

interface AccountPanelProps {
  currentUser?: {
    id?: string
    email?: string
    name?: string
    avatarUrl?: string
  } | null
  onSignOut?: () => void
  onNavigateToAuth?: (mode: 'login' | 'signup' | 'forgot' | 'reset') => void
  onUpdateProfile?: (newName: string) => Promise<boolean>
}

export function AccountPanel({
  currentUser,
  onSignOut,
  onNavigateToAuth,
  onUpdateProfile,
}: AccountPanelProps) {
  const { t } = useLanguage()
  const [editing, setEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [fullName, setFullName] = useState(currentUser?.name || 'Maya Chen')
  const [email, setEmail] = useState(currentUser?.email || 'maya@example.com')
  const [savedNotice, setSavedNotice] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [currentPass, setCurrentPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [avatarName, setAvatarName] = useState<string | null>(null)
  const photoInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (currentUser?.name) setFullName(currentUser.name)
    if (currentUser?.email) setEmail(currentUser.email)
  }, [currentUser])

  const showNotice = (msg: string) => {
    setSavedNotice(msg)
    setTimeout(() => {
      setSavedNotice(null)
    }, 5000)
  }

  const handlePasswordSubmit = async () => {
    if (!newPass) {
      showNotice(t('authErrPassword'))
      return
    }
    if (newPass.length < 8) {
      showNotice(t('authErrPasswordLength'))
      return
    }
    if (newPass !== confirmPass) {
      showNotice(t('authErrPasswordMatch'))
      return
    }
    if (!isSupabaseConfigured()) {
      showNotice('Supabase client is not configured.')
      return
    }
    setIsUpdatingPassword(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({
        password: newPass,
      })
      if (error) {
        showNotice(`Password update error: ${error.message}`)
      } else {
        setCurrentPass('')
        setNewPass('')
        setConfirmPass('')
        showNotice(t('accToastPassUpdated'))
      }
    } catch (err: any) {
      showNotice(err?.message || 'Error updating password')
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!currentUser?.id || !isSupabaseConfigured()) {
      setDeleteOpen(false)
      showNotice('Guest session data reset.')
      if (onSignOut) onSignOut()
      return
    }
    setIsDeletingAccount(true)
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })

      const data = await res.json()

      if (!res.ok) {
        showNotice(data.error || 'Failed to process account deletion.')
        setDeleteOpen(false)
        return
      }

      if (isSupabaseConfigured()) {
        const supabase = createClient()
        await supabase.auth.signOut()
      }

      setDeleteOpen(false)
      if (data.adminKeyMissing) {
        showNotice('All study data, notes, and quiz history purged. Permanent auth user deletion requires administrative server configuration.')
      } else {
        showNotice('Account credentials and all study data permanently deleted.')
      }

      setTimeout(() => {
        if (onSignOut) {
          onSignOut()
        } else {
          window.location.href = '/login'
        }
      }, 1500)
    } catch (err: any) {
      showNotice(err?.message || 'Error processing account deletion.')
    } finally {
      setIsDeletingAccount(false)
    }
  }

  const initials = fullName
    ? fullName
        .trim()
        .split(/\s+/)
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'MC'

  return (
    <div className="max-w-3xl space-y-6">
      {savedNotice && (
        <div className="flex items-center gap-2 rounded-xl border border-[#b8dfce] bg-[#f0f9f4] p-3.5 text-xs font-semibold text-[#1f583d] animate-in fade-in duration-150">
          <CheckCircle2 size={16} className="text-[#2e7d56] shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}

      {/* Profile Card */}
      <div className="rounded-2xl border border-[#e7e6e1] bg-white dark:border-[#282a3e] dark:bg-[#1a1b29] p-6 shadow-[0_2px_12px_rgba(31,35,53,0.025)] md:p-8">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex size-16 items-center justify-center rounded-full bg-[#f2c9a9] text-lg font-bold text-[#75472c] ring-2 ring-[#4f5bd5]/20 overflow-hidden">
            {currentUser?.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={fullName}
                className="size-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-[#202337] dark:text-white">{t('accGroupProfile')}</div>
            <p className="mt-1 text-xs text-[#9293a0] dark:text-[#84879c]">
              {avatarName ? `Selected: ${avatarName}` : 'JPG or PNG up to 5 MB.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="rounded-xl border border-[#deded9] bg-white px-3.5 py-2 text-xs font-semibold text-[#4b4e60] hover:border-[#bfc3f1] hover:text-[#4f5bd5] dark:border-[#32354e] dark:bg-[#222436] dark:text-[#d0d3e5] dark:hover:border-[#4f5bd5] dark:hover:text-[#9aa3f8] transition shadow-xs"
          >
            {t('accBtnUploadPhoto')}
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) {
                const f = e.target.files[0]
                setAvatarName(f.name)
                showNotice(`Photo "${f.name}" selected.`)
              }
            }}
          />
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <label className="text-xs font-semibold text-[#333649] dark:text-[#d0d3e5]">
            {t('accLabelFullName')}
            <input
              disabled={!editing}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-2 w-full rounded-xl border border-[#e4e4df] bg-[#fbfbfa] px-3 py-2.5 text-sm text-[#202337] outline-none disabled:text-[#777989] dark:border-[#32354e] dark:bg-[#161724] dark:text-white dark:disabled:text-[#84879c] focus:border-[#4f5bd5]"
            />
          </label>
          <label className="text-xs font-semibold text-[#333649] dark:text-[#d0d3e5]">
            {t('accLabelEmail')}
            <input
              disabled={!editing}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-xl border border-[#e4e4df] bg-[#fbfbfa] px-3 py-2.5 text-sm text-[#202337] outline-none disabled:text-[#777989] dark:border-[#32354e] dark:bg-[#161724] dark:text-white dark:disabled:text-[#84879c] focus:border-[#4f5bd5]"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-[#438568] dark:text-[#5ec290]">
          <Mail size={14} /> {t('settingsEmailStatusLabel')}:{' '}
          <span className="font-semibold">{t('settingsEmailVerifiedBadge')}</span>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {editing ? (
            <>
              <button
                type="button"
                disabled={isSaving}
                onClick={async () => {
                  if (onUpdateProfile) {
                    setIsSaving(true)
                    const ok = await onUpdateProfile(fullName)
                    setIsSaving(false)
                    if (ok) {
                      setEditing(false)
                      showNotice(t('accToastProfileSaved'))
                    }
                  } else {
                    setEditing(false)
                    showNotice(t('accToastProfileSaved'))
                  }
                }}
                className="rounded-xl bg-[#4f5bd5] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#434ec4] transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSaving && <Loader2 size={13} className="animate-spin" />}
                <span>{isSaving ? 'Saving...' : t('accBtnSave')}</span>
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setEditing(false)}
                className="rounded-xl border border-[#deded9] px-4 py-2.5 text-xs font-semibold hover:bg-[#f5f5f2] dark:border-[#32354e] dark:bg-[#222436] dark:text-[#d0d3e5] dark:hover:bg-[#282b42] transition cursor-pointer"
              >
                {t('cancel')}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-xl bg-[#4f5bd5] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#434ec4] transition"
            >
              {t('accBtnEdit')}
            </button>
          )}
        </div>
      </div>

      {/* Account Security Card */}
      <div className="rounded-2xl border border-[#e7e6e1] bg-white dark:border-[#282a3e] dark:bg-[#1a1b29] p-6 shadow-[0_2px_12px_rgba(31,35,53,0.025)] md:p-8">
        <div className="flex items-center gap-2">
          <LockKeyhole size={17} className="text-[#4f5bd5] dark:text-[#9aa3f8]" />
          <h3 className="font-semibold text-[#202337] dark:text-white">{t('accGroupSecurity')}</h3>
        </div>
        <p className="mt-1 text-xs text-[#9293a0] dark:text-[#84879c]">
          {t('settingsPrivacyBannerDesc')}
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-xs font-semibold text-[#333649] dark:text-[#d0d3e5] md:col-span-2">
            {t('accLabelCurrentPass')}
            <input
              type={showPassword ? 'text' : 'password'}
              value={currentPass}
              onChange={(e) => setCurrentPass(e.target.value)}
              placeholder="••••••••"
              className="mt-2 w-full rounded-xl border border-[#e4e4df] bg-[#fbfbfa] px-3 py-2.5 text-sm text-[#202337] outline-none dark:border-[#32354e] dark:bg-[#161724] dark:text-white dark:placeholder-[#6f7288] focus:border-[#4f5bd5]"
            />
          </label>
          <label className="text-xs font-semibold text-[#333649] dark:text-[#d0d3e5]">
            {t('accLabelNewPass')}
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="••••••••"
              className="mt-2 w-full rounded-xl border border-[#e4e4df] bg-[#fbfbfa] px-3 py-2.5 text-sm text-[#202337] outline-none dark:border-[#32354e] dark:bg-[#161724] dark:text-white dark:placeholder-[#6f7288] focus:border-[#4f5bd5]"
            />
          </label>
          <label className="text-xs font-semibold text-[#333649] dark:text-[#d0d3e5]">
            {t('accLabelConfirmPass')}
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              placeholder="••••••••"
              className="mt-2 w-full rounded-xl border border-[#e4e4df] bg-[#fbfbfa] px-3 py-2.5 text-sm text-[#202337] outline-none dark:border-[#32354e] dark:bg-[#161724] dark:text-white dark:placeholder-[#6f7288] focus:border-[#4f5bd5]"
            />
          </label>
        </div>

        <label className="mt-4 flex items-center gap-2 text-xs text-[#777989] dark:text-[#84879c] cursor-pointer">
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(e) => setShowPassword(e.target.checked)}
            className="size-4 accent-[#4f5bd5] rounded"
          />
          Show password
        </label>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={isUpdatingPassword}
            onClick={handlePasswordSubmit}
            className="flex items-center gap-2 rounded-xl bg-[#4f5bd5] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#434ec4] transition disabled:opacity-50"
          >
            {isUpdatingPassword && <Loader2 size={13} className="animate-spin" />}
            {t('accBtnUpdatePass')}
          </button>
          <Link
            href="/forgot-password"
            className="text-xs font-semibold text-[#4f5bd5] dark:text-[#9aa3f8] hover:underline flex items-center gap-1"
          >
            <KeyRound size={13} /> {t('authForgotHeading')}
          </Link>
        </div>

        <div className="mt-7 rounded-xl border border-dashed border-[#deded9] dark:border-[#32354e] dark:bg-[#161724] p-4 text-xs text-[#777989] dark:text-[#84879c]">
          <div className="font-semibold text-[#202337] dark:text-white">{t('accGroupSessions')}</div>
          <p className="mt-1">
            {t('accSessionCurrent')}
          </p>
        </div>
      </div>

      {/* Account Management Card */}
      <div className="rounded-2xl border border-[#e7e6e1] bg-white dark:border-[#282a3e] dark:bg-[#1a1b29] p-6 shadow-[0_2px_12px_rgba(31,35,53,0.025)] md:p-8">
        <h3 className="font-semibold text-[#202337] dark:text-white">{t('accTitle')}</h3>
        <p className="mt-1 text-xs text-[#9293a0] dark:text-[#84879c]">
          {t('accDesc')}
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              if (onSignOut) {
                onSignOut()
              } else {
                window.location.href = '/login'
              }
            }}
            className="flex items-center gap-2 rounded-xl border border-[#deded9] px-4 py-2.5 text-xs font-semibold text-[#4b4e60] hover:bg-[#f5f5f2] dark:border-[#32354e] dark:bg-[#222436] dark:text-[#d0d3e5] dark:hover:bg-[#282b42] transition cursor-pointer"
          >
            <LogOut size={14} /> {t('profileMenuSignOut')}
          </button>

          <Link
            href="/signup"
            className="flex items-center gap-2 rounded-xl border border-[#deded9] px-4 py-2.5 text-xs font-semibold text-[#4f5bd5] hover:bg-[#edeefd]/40 dark:border-[#32354e] dark:bg-[#222436] dark:text-[#9aa3f8] dark:hover:bg-[#282b42] transition"
          >
            <ExternalLink size={14} /> {t('profileMenuSignUp')}
          </Link>

          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-[#efc9c4] px-4 py-2.5 text-xs font-semibold text-[#b45b51] hover:bg-[#fdf1ef] dark:border-[#4d2320] dark:bg-[#241716] dark:text-[#f28b80] dark:hover:bg-[#361d1c] transition"
          >
            <Trash2 size={14} /> {t('accBtnDeleteAccount')}
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-[#e7e6e1] bg-white dark:border-[#2f3249] dark:bg-[#1a1b29] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#202337] dark:text-white">{t('accModalTitle')}</h3>
            <p className="mt-2 text-sm leading-6 text-[#777989] dark:text-[#9ea1b5]">
              {t('accModalDesc')}
            </p>
            <div className="mt-3 rounded-xl bg-[#fdf1ef] dark:bg-[#2b1716] p-3 text-xs text-[#b45b51] dark:text-[#f28b80] border border-[#efc9c4] dark:border-[#4d2320]">
              Purging your study materials, quiz attempts, notes, and session records will take effect immediately. To permanently delete auth credentials, please contact project administration.
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={isDeletingAccount}
                onClick={() => setDeleteOpen(false)}
                className="rounded-xl border border-[#deded9] px-4 py-2.5 text-xs font-semibold hover:bg-[#f5f5f2] dark:border-[#32354e] dark:bg-[#222436] dark:text-[#d0d3e5] dark:hover:bg-[#282b42] transition"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={isDeletingAccount}
                onClick={handleDeleteAccount}
                className="flex items-center gap-2 rounded-xl bg-[#b45b51] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#9e463d] transition disabled:opacity-50"
              >
                {isDeletingAccount && <Loader2 size={13} className="animate-spin" />}
                {t('accModalConfirmBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

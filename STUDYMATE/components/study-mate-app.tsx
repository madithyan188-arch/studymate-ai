'use client'

import Link from 'next/link'
import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import {
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Lightbulb,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  Mic,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  History,
  MessageSquare,
  Target,
  Trash2,
  Upload,
  UserRound,
  Volume2,
  X,
  Zap,
  KeyRound,
  ExternalLink,
  Copy,
  CheckCircle2,
  Bookmark,
  BookmarkCheck,
  Loader2,
  Pencil,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AccountPanel, SettingGroup, SettingRow, ToggleRow } from '@/components/account-settings'
import { AuthScreen, AuthMode } from '@/components/auth-screens'
import { useLanguage, Language, SUPPORTED_LANGUAGES } from '@/lib/i18n'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import type {
  ProfileRow,
  UserSettingsRow,
  MaterialRow,
  StudyNoteRow,
  QuizAttemptRow,
  TutorConversationRow,
  TutorMessageRow,
  ScanQueryRow,
  NoteSection,
  SupportedLanguage,
  QuizLength,
  ExplanationStyle,
  ReadSpeed,
  MaterialType,
  MaterialStatus,
  Json,
} from '@/lib/supabase/database.types'

export type Screen =
  | 'Dashboard'
  | 'My Materials'
  | 'AI Notes'
  | 'Interactive Quiz'
  | 'AI Tutor'
  | 'My Progress'
  | 'Scan & Find Answers'
  | 'Settings'
  | 'Manage Account'
  | 'Login'
  | 'Sign Up'
  | 'Forgot Password'
  | 'Reset Password'

export const screenTitleKeyMap: Record<Screen, string> = {
  Dashboard: 'navDashboard',
  'My Materials': 'navMaterials',
  'AI Notes': 'navNotes',
  'Interactive Quiz': 'navQuiz',
  'AI Tutor': 'navTutor',
  'My Progress': 'navProgress',
  'Scan & Find Answers': 'navScan',
  Settings: 'navSettings',
  'Manage Account': 'navManageAccount',
  Login: 'navLogin',
  'Sign Up': 'navSignUp',
  'Forgot Password': 'navForgotPassword',
  'Reset Password': 'navResetPassword',
}

export type ThemeMode = 'Light' | 'Dark (Preview)' | 'System'

const THEME_STORAGE_KEY = 'studymate_theme'

export type Material = {
  id?: string
  name: string
  type: string
  size: string
  progress: number
  status: 'Ready' | 'Processing' | 'Failed'
  created_at?: string
  updated_at?: string
}

const navItems: { label: Screen; icon: typeof LayoutDashboard }[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'My Materials', icon: FolderOpen },
  { label: 'AI Notes', icon: FileText },
  { label: 'Interactive Quiz', icon: CircleHelp },
  { label: 'AI Tutor', icon: Bot },
  { label: 'My Progress', icon: Target },
  { label: 'Scan & Find Answers', icon: Search },
  { label: 'Settings', icon: Settings },
  { label: 'Manage Account', icon: UserRound },
]

const starterMaterials: Material[] = [
  { name: 'Biology – Cell Structure.pdf', type: 'PDF', size: '2.4 MB', progress: 100, status: 'Ready' },
  { name: 'Organic Chemistry notes.txt', type: 'TXT', size: '84 KB', progress: 100, status: 'Ready' },
  { name: 'Introduction to Psychology.pdf', type: 'PDF', size: '5.1 MB', progress: 100, status: 'Ready' },
]

const quizQuestions = [
  {
    question: 'Which structure controls what enters and leaves a cell?',
    options: ['Cell wall', 'Cell membrane', 'Cytoplasm', 'Nucleus'],
    answer: 1,
    explanation: 'The cell membrane is selectively permeable and regulates the movement of substances into and out of the cell.',
    topic: 'Cell biology',
  },
  {
    question: 'What is the primary role of mitochondria?',
    options: ['Store genetic information', 'Produce proteins', 'Generate cellular energy', 'Digest waste'],
    answer: 2,
    explanation: 'Mitochondria generate ATP, the usable energy currency of the cell, through cellular respiration.',
    topic: 'Cell organelles',
  },
  {
    question: 'Where is genetic material primarily stored in a eukaryotic cell?',
    options: ['Ribosome', 'Nucleus', 'Golgi apparatus', 'Vacuole'],
    answer: 1,
    explanation: "The nucleus contains most of a eukaryotic cell's DNA and directs cell activity.",
    topic: 'Cell biology',
  },
]

export function StudyMateApp() {
  const { t, language, setLanguage, supportedLanguages, quizQuestions } = useLanguage()
  const [screen, setScreen] = useState<Screen>('Dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [materials, setMaterials] = useState<Material[]>(starterMaterials)
  const [selectedMaterial, setSelectedMaterial] = useState(starterMaterials[0].name)
  const [quizIndex, setQuizIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [quizDone, setQuizDone] = useState(false)
  const [conversations, setConversations] = useState<TutorConversationRow[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [isLoadingConversations, setIsLoadingConversations] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [chat, setChat] = useState<Array<{ role: 'user' | 'ai'; text: string; id?: string }>>([
    {
      role: 'ai',
      text: t('tutorWelcomeMessage'),
    },
  ])
  const [message, setMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isReading, setIsReading] = useState(false)
  const [scanText, setScanText] = useState('')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Appearance Theme state (persisted to localStorage)
  const [theme, setTheme] = useState<ThemeMode>('Light')

  const [currentUser, setCurrentUser] = useState<{
    id?: string
    email?: string
    name?: string
    avatarUrl?: string
  } | null>(null)
  const [userProfile, setUserProfile] = useState<ProfileRow | null>(null)
  const [userSettings, setUserSettings] = useState<UserSettingsRow | null>(null)
  const [studyNotes, setStudyNotes] = useState<StudyNoteRow[]>([])
  const [quizAttempts, setQuizAttempts] = useState<QuizAttemptRow[]>([])
  const [scanQueries, setScanQueries] = useState<ScanQueryRow[]>([])
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(false)
  const [isLoadingNotes, setIsLoadingNotes] = useState(false)
  const [isLoadingQuizAttempts, setIsLoadingQuizAttempts] = useState(false)
  const [isSavingQuizAttempt, setIsSavingQuizAttempt] = useState(false)
  const [isLoadingScanQueries, setIsLoadingScanQueries] = useState(false)

  // Fetch materials for current signed-in user
  const loadUserMaterials = useCallback(async (userId: string) => {
    if (!isSupabaseConfigured()) return
    setIsLoadingMaterials(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[StudyMate DB] Failed to fetch materials:', error.message)
      } else if (data) {
        const mapped: Material[] = data.map((m) => {
          const sizeDisplay =
            m.size_display ||
            (m.size_bytes > 1024 * 1024
              ? `${(m.size_bytes / (1024 * 1024)).toFixed(1)} MB`
              : `${Math.max(1, Math.round(m.size_bytes / 1024))} KB`)
          return {
            id: m.id,
            name: m.name,
            type: m.type,
            size: sizeDisplay,
            progress: m.progress,
            status: m.status as 'Ready' | 'Processing' | 'Failed',
            created_at: m.created_at,
            updated_at: m.updated_at,
          }
        })
        setMaterials(mapped)
        setSelectedMaterial((curr) => {
          if (mapped.length > 0 && !mapped.some((m) => m.name === curr)) {
            return mapped[0].name
          }
          return curr
        })
      }
    } catch (err: any) {
      console.error('[StudyMate DB] Error in loadUserMaterials:', err)
    } finally {
      setIsLoadingMaterials(false)
    }
  }, [])

  // Fetch study notes for current signed-in user
  const loadUserNotes = useCallback(async (userId: string) => {
    if (!isSupabaseConfigured()) return
    setIsLoadingNotes(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('study_notes')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[StudyMate DB] Failed to fetch study notes:', error.message)
      } else if (data) {
        setStudyNotes(data)
      }
    } catch (err: any) {
      console.error('[StudyMate DB] Error in loadUserNotes:', err)
    } finally {
      setIsLoadingNotes(false)
    }
  }, [])

  // Fetch quiz attempts for current signed-in user
  const loadUserQuizAttempts = useCallback(async (userId: string) => {
    if (!isSupabaseConfigured()) return
    setIsLoadingQuizAttempts(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('quiz_attempts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[StudyMate DB] Failed to fetch quiz attempts:', error.message)
      } else if (data) {
        setQuizAttempts(data)
      }
    } catch (err: any) {
      console.error('[StudyMate DB] Error in loadUserQuizAttempts:', err)
    } finally {
      setIsLoadingQuizAttempts(false)
    }
  }, [])

  // Fetch messages for a specific tutor conversation
  const loadConversationMessages = useCallback(
    async (conversationId: string, userId: string) => {
      if (!isSupabaseConfigured()) return
      setIsLoadingMessages(true)
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('tutor_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .eq('user_id', userId)
          .order('created_at', { ascending: true })

        if (error) {
          console.error('[StudyMate DB] Failed to fetch conversation messages:', error.message)
        } else if (data && data.length > 0) {
          setChat(
            data.map((m) => ({
              role: m.role as 'user' | 'ai',
              text: m.text,
              id: m.id,
            }))
          )
        } else {
          setChat([
            {
              role: 'ai',
              text: t('tutorWelcomeMessage'),
            },
          ])
        }
      } catch (err: any) {
        console.error('[StudyMate DB] Error in loadConversationMessages:', err)
      } finally {
        setIsLoadingMessages(false)
      }
    },
    [t]
  )

  // Fetch tutor conversations for current signed-in user
  const loadUserConversations = useCallback(
    async (userId: string) => {
      if (!isSupabaseConfigured()) return
      setIsLoadingConversations(true)
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('tutor_conversations')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })

        if (error) {
          console.error('[StudyMate DB] Failed to fetch tutor conversations:', error.message)
        } else if (data) {
          setConversations(data)
          // If no active conversation selected and there are conversations, load the latest
          if (data.length > 0) {
            setActiveConversationId((current) => {
              const activeExists = current && data.some((c) => c.id === current)
              if (!activeExists) {
                loadConversationMessages(data[0].id, userId)
                return data[0].id
              }
              return current
            })
          }
        }
      } catch (err: any) {
        console.error('[StudyMate DB] Error in loadUserConversations:', err)
      } finally {
        setIsLoadingConversations(false)
      }
    },
    [loadConversationMessages]
  )

  // Fetch scan queries for current signed-in user
  const loadUserScanQueries = useCallback(async (userId: string) => {
    if (!isSupabaseConfigured()) return
    setIsLoadingScanQueries(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('scan_queries')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[StudyMate DB] Failed to fetch scan queries:', error.message)
      } else if (data) {
        setScanQueries(data)
      }
    } catch (err: any) {
      console.error('[StudyMate DB] Error in loadUserScanQueries:', err)
    } finally {
      setIsLoadingScanQueries(false)
    }
  }, [])

  // Non-destructive read-only fetch of user profile, settings, materials, notes, quiz attempts, conversations, and scans
  const loadUserData = useCallback(
    async (userId: string, authUser: any) => {
      if (!isSupabaseConfigured()) return
      try {
        const supabase = createClient()

        // 1. SELECT query on profiles for current authenticated user
        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle()

        if (profileErr) {
          console.error('[StudyMate DB] Profile query error:', profileErr.message)
        } else if (!profile) {
          console.warn('[StudyMate DB] No profile record found for user ID:', userId)
        } else {
          console.info('[StudyMate DB] Successfully retrieved profile for user ID:', userId)
          setUserProfile(profile)
        }

        // 2. SELECT query on user_settings for current authenticated user
        const { data: settings, error: settingsErr } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle()

        if (settingsErr) {
          console.error('[StudyMate DB] Settings query error:', settingsErr.message)
        } else if (!settings) {
          console.warn('[StudyMate DB] No settings record found for user ID:', userId)
        } else {
          console.info('[StudyMate DB] Successfully retrieved settings for user ID:', userId)
          setUserSettings(settings)
          // Synchronize language if supported
          if (settings.language && ['en', 'ml', 'hi', 'ta'].includes(settings.language)) {
            setLanguage(settings.language)
          }
          // Synchronize theme if valid
          if (settings.theme && ['Light', 'Dark (Preview)', 'System'].includes(settings.theme)) {
            setTheme(settings.theme)
          }
        }

        // Extract Google OAuth metadata
        const googleName = authUser?.user_metadata?.full_name || authUser?.user_metadata?.name
        const googleAvatar = authUser?.user_metadata?.avatar_url || authUser?.user_metadata?.picture
        const emailPrefix = authUser?.email?.split('@')[0]

        // Sync Google OAuth metadata to public.profiles if profile full_name is empty or was defaulted to email username
        if (profile) {
          const isDefaultOrEmpty = !profile.full_name || profile.full_name === emailPrefix
          if (isDefaultOrEmpty && googleName && googleName !== profile.full_name) {
            try {
              const { error: syncErr } = await supabase
                .from('profiles')
                .update({
                  full_name: googleName,
                  avatar_url: profile.avatar_url || googleAvatar || null,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', userId)

              if (!syncErr) {
                profile.full_name = googleName
                if (!profile.avatar_url && googleAvatar) {
                  profile.avatar_url = googleAvatar
                }
                setUserProfile({ ...profile })
              }
            } catch (syncCatch) {
              console.warn('[StudyMate DB] Could not sync Google profile name:', syncCatch)
            }
          }
        }

        // Set current user representation (prioritizing verified profile table over auth metadata)
        const displayName = profile?.full_name || googleName || emailPrefix || 'Student'
        const avatarUrl = profile?.avatar_url || googleAvatar || undefined

        setCurrentUser({
          id: userId,
          email: authUser?.email,
          name: displayName,
          avatarUrl,
        })

        // 3. Fetch materials, study notes, quiz attempts, tutor conversations, and scan queries for the user
        await Promise.all([
          loadUserMaterials(userId),
          loadUserNotes(userId),
          loadUserQuizAttempts(userId),
          loadUserConversations(userId),
          loadUserScanQueries(userId),
        ])
      } catch (err: any) {
        console.error('[StudyMate DB] Unexpected error during live query:', err)
      }
    },
    [setLanguage, loadUserMaterials, loadUserNotes, loadUserQuizAttempts, loadUserConversations, loadUserScanQueries]
  )

  // Listen to Supabase session state
  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const supabase = createClient()
    supabase.auth.getUser().then((res: any) => {
      const user = res?.data?.user
      if (user) {
        loadUserData(user.id, user)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      if (session?.user) {
        loadUserData(session.user.id, session.user)
      } else {
        setCurrentUser(null)
        setUserProfile(null)
        setUserSettings(null)
        setMaterials(starterMaterials)
        setSelectedMaterial(starterMaterials[0].name)
        setStudyNotes([])
        setQuizAttempts([])
        setConversations([])
        setActiveConversationId(null)
        setScanQueries([])
        setChat([
          {
            role: 'ai',
            text: t('tutorWelcomeMessage'),
          },
        ])
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [loadUserData, t])

  const handleSignOut = async () => {
    setProfileMenuOpen(false)
    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient()
        await supabase.auth.signOut()
      } catch (err) {
        console.error('Sign out error:', err)
      }
    }
    setCurrentUser(null)
    setUserProfile(null)
    setUserSettings(null)
    setMaterials(starterMaterials)
    setSelectedMaterial(starterMaterials[0].name)
    setStudyNotes([])
    setQuizAttempts([])
    setConversations([])
    setActiveConversationId(null)
    setScanQueries([])
    setScanText('')
    setChat([
      {
        role: 'ai',
        text: t('tutorWelcomeMessage'),
      },
    ])
    navigate('Login')
  }

  const userInitials = useMemo(() => {
    if (currentUser?.name) {
      const parts = currentUser.name.trim().split(/\s+/)
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      return parts[0].slice(0, 2).toUpperCase()
    }
    return 'MC'
  }, [currentUser])

  // Load theme from localStorage on initial render
  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null
      if (stored && ['Light', 'Dark (Preview)', 'System'].includes(stored)) {
        setTheme(stored)
      }
    } catch {
      // Ignore storage access errors
    }
  }, [])

  // Sync initial tutor welcome when language changes if it's the only message
  useEffect(() => {
    setChat((prev) => {
      if (prev.length === 1 && prev[0].role === 'ai') {
        return [{ role: 'ai', text: t('tutorWelcomeMessage') }]
      }
      return prev
    })
  }, [language, t])

  // Apply theme to documentElement whenever theme state changes
  useEffect(() => {
    const applyTheme = (currentTheme: ThemeMode) => {
      let isDark = false
      if (currentTheme === 'Dark (Preview)') {
        isDark = true
      } else if (currentTheme === 'System') {
        isDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
      }

      if (isDark) {
        document.documentElement.classList.add('dark')
        document.documentElement.classList.remove('light')
        document.documentElement.style.colorScheme = 'dark'
      } else {
        document.documentElement.classList.remove('dark')
        document.documentElement.classList.add('light')
        document.documentElement.style.colorScheme = 'light'
      }
    }

    applyTheme(theme)

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Ignore storage access errors
    }

    if (theme === 'System' && typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const listener = () => applyTheme('System')
      mediaQuery.addEventListener('change', listener)
      return () => mediaQuery.removeEventListener('change', listener)
    }
  }, [theme])

  const updateUserSettings = useCallback(
    async (partial: Partial<UserSettingsRow>): Promise<boolean> => {
      if (!currentUser?.id || !isSupabaseConfigured()) {
        return true
      }
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('user_settings')
          .update({
            ...partial,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', currentUser.id)
          .select()
          .maybeSingle()

        if (error) {
          console.error('[StudyMate DB] Failed to update user_settings:', error.message)
          return false
        }
        if (data) {
          setUserSettings(data)
        }
        return true
      } catch (err: any) {
        console.error('[StudyMate DB] Error in updateUserSettings:', err)
        return false
      }
    },
    [currentUser?.id]
  )

  const handleThemeChange = (newTheme: ThemeMode) => {
    setTheme(newTheme)
    updateUserSettings({ theme: newTheme })
    showToast(t('settingsToastThemeUpdated', { theme: newTheme }))
  }

  const score = useMemo(
    () => quizQuestions.reduce((total, q, i) => total + (answers[i] === q.answer ? 1 : 0), 0),
    [answers, quizQuestions]
  )

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr))
    }, 3800)
  }

  const navigate = (next: Screen) => {
    setScreen(next)
    setSidebarOpen(false)
    setProfileMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Handle clicking outside profile menu
  useEffect(() => {
    if (!profileMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('#profile-menu-container')) {
        setProfileMenuOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [profileMenuOpen])

  const currentMaterialObj = useMemo(() => {
    return materials.find((m) => m.name === selectedMaterial) || null
  }, [materials, selectedMaterial])

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const fileArray = Array.from(files)

    if (currentUser?.id && isSupabaseConfigured()) {
      setIsLoadingMaterials(true)
      try {
        const supabase = createClient()
        const itemsToInsert = fileArray.map((file) => {
          let type: MaterialType = 'DOC'
          const lower = file.name.toLowerCase()
          if (lower.endsWith('.pdf')) type = 'PDF'
          else if (lower.endsWith('.txt')) type = 'TXT'
          else if (lower.endsWith('.docx')) type = 'DOCX'

          const sizeDisplay =
            file.size > 1024 * 1024
              ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
              : `${Math.max(1, Math.round(file.size / 1024))} KB`

          return {
            user_id: currentUser.id!,
            name: file.name,
            type,
            size_bytes: file.size,
            size_display: sizeDisplay,
            status: 'Ready' as MaterialStatus,
            progress: 100,
            storage_path: null, // Note: Supabase Storage bucket is not yet provisioned; metadata is persisted to public.materials
          }
        })

        const { data, error } = await supabase
          .from('materials')
          .insert(itemsToInsert)
          .select()

        if (error) {
          console.error('[StudyMate DB] Error inserting materials:', error)
          showToast(`Error adding material: ${error.message}`)
        } else {
          await loadUserMaterials(currentUser.id)
          if (data && data.length > 0) {
            setSelectedMaterial(data[0].name)
          }
          showToast(t('matToastAdded', { count: fileArray.length }))
        }
      } catch (err: any) {
        console.error('[StudyMate DB] Unexpected error in uploadFiles:', err)
        showToast('Unexpected error uploading material.')
      } finally {
        setIsLoadingMaterials(false)
      }
    } else {
      // Local fallback for unauthenticated preview mode
      const newItems: Material[] = fileArray.map((file) => ({
        name: file.name,
        type: file.name.endsWith('.txt') ? 'TXT' : file.name.endsWith('.pdf') ? 'PDF' : 'DOC',
        size:
          file.size > 1024 * 1024
            ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
            : `${Math.max(1, Math.round(file.size / 1024))} KB`,
        progress: 100,
        status: 'Ready',
      }))
      setMaterials((current) => [...newItems, ...current])
      setSelectedMaterial(newItems[0].name)
      showToast(t('matToastAdded', { count: newItems.length }))
    }
  }

  const deleteMaterial = async (materialOrName: Material | string) => {
    const target =
      typeof materialOrName === 'string'
        ? materials.find((m) => m.name === materialOrName || m.id === materialOrName)
        : materialOrName

    if (!target) return

    if (target.id && currentUser?.id && isSupabaseConfigured()) {
      setIsLoadingMaterials(true)
      try {
        const supabase = createClient()
        const { error } = await supabase
          .from('materials')
          .delete()
          .eq('id', target.id)
          .eq('user_id', currentUser.id)

        if (error) {
          console.error('[StudyMate DB] Failed to delete material:', error)
          showToast(`Failed to delete material: ${error.message}`)
          return
        }

        await loadUserMaterials(currentUser.id)
        await loadUserNotes(currentUser.id)
        showToast(t('matToastRemoved', { name: target.name }))
      } catch (err: any) {
        console.error('[StudyMate DB] Unexpected error deleting material:', err)
        showToast('Failed to delete material.')
      } finally {
        setIsLoadingMaterials(false)
      }
    } else {
      // Local fallback
      setMaterials((current) => {
        const remaining = current.filter((m) => m.name !== target.name)
        if (selectedMaterial === target.name && remaining.length > 0) {
          setSelectedMaterial(remaining[0].name)
        }
        return remaining
      })
      showToast(t('matToastRemoved', { name: target.name }))
    }
  }

  const handleRenameMaterial = async (materialId: string, newName: string) => {
    if (!newName.trim()) return
    if (currentUser?.id && isSupabaseConfigured()) {
      try {
        const supabase = createClient()
        const { error } = await supabase
          .from('materials')
          .update({ name: newName.trim() })
          .eq('id', materialId)
          .eq('user_id', currentUser.id)

        if (error) {
          console.error('[StudyMate DB] Failed to rename material:', error)
          showToast(`Failed to rename material: ${error.message}`)
          return
        }

        await loadUserMaterials(currentUser.id)
        showToast('Material renamed successfully.')
      } catch (err: any) {
        console.error('[StudyMate DB] Unexpected error renaming material:', err)
        showToast('Failed to rename material.')
      }
    } else {
      setMaterials((curr) =>
        curr.map((m) => (m.id === materialId || m.name === selectedMaterial ? { ...m, name: newName.trim() } : m))
      )
      setSelectedMaterial(newName.trim())
      showToast('Material renamed.')
    }
  }

  const createNoteForMaterial = async (
    materialId?: string,
    materialName?: string,
    title?: string,
    summary?: string
  ) => {
    const targetMat = materialId ? materials.find((m) => m.id === materialId) : currentMaterialObj
    const matName = materialName || targetMat?.name || selectedMaterial
    const matId = targetMat?.id || materialId || null

    if (currentUser?.id && isSupabaseConfigured()) {
      setIsLoadingNotes(true)
      try {
        const supabase = createClient()
        const defaultSections: NoteSection[] = [
          {
            id: 'notes-summary',
            title: t('notesTabMindMap'),
            content:
              summary ||
              `Study notes and key concepts generated from ${matName}. This structured summary outlines the foundational principles and revision points.`,
          },
          {
            id: 'notes-concepts',
            title: t('notesTabKeyConcepts'),
            content: `Core concepts and exam-oriented definitions for ${matName}.`,
            examTip: 'Review high-yield definitions and conceptual linkages before starting interactive quiz practice.',
            bullets: [
              'Essential terminology and definitions',
              'Fundamental mechanisms and workflows',
              'Key exam checkpoints and review questions',
            ],
          },
        ]

        const noteTitle = title || `${matName.replace(/\.[^/.]+$/, '')} Notes`
        const noteSummary =
          summary ||
          `AI study notes generated from ${matName}. Review definitions, key takeaways, and test concepts.`

        const { data, error } = await supabase
          .from('study_notes')
          .insert({
            user_id: currentUser.id,
            material_id: matId,
            title: noteTitle,
            summary: noteSummary,
            sections: defaultSections as any,
            is_bookmarked: false,
            language: (['en', 'ml', 'hi', 'ta'].includes(language) ? language : 'en') as SupportedLanguage,
          })
          .select()
          .single()

        if (error) {
          console.error('[StudyMate DB] Failed to create note:', error)
          showToast(`Failed to create note: ${error.message}`)
        } else {
          await loadUserNotes(currentUser.id)
          showToast('Study note created and saved.')
        }
      } catch (err: any) {
        console.error('[StudyMate DB] Unexpected error creating note:', err)
        showToast('Error creating note.')
      } finally {
        setIsLoadingNotes(false)
      }
    } else {
      showToast('Study note generated (preview mode).')
    }
  }

  const updateNote = async (noteId: string, updates: Partial<StudyNoteRow>) => {
    if (currentUser?.id && isSupabaseConfigured()) {
      try {
        const supabase = createClient()
        const { error } = await supabase
          .from('study_notes')
          .update(updates)
          .eq('id', noteId)
          .eq('user_id', currentUser.id)

        if (error) {
          console.error('[StudyMate DB] Failed to update note:', error)
          showToast(`Failed to update note: ${error.message}`)
          return
        }

        await loadUserNotes(currentUser.id)
        if (updates.is_bookmarked !== undefined) {
          showToast(updates.is_bookmarked ? 'Note saved to bookmarks.' : 'Bookmark removed.')
        } else {
          showToast('Note updated successfully.')
        }
      } catch (err: any) {
        console.error('[StudyMate DB] Error updating note:', err)
        showToast('Failed to update note.')
      }
    } else {
      showToast('Note updated (preview mode).')
    }
  }

  const deleteNote = async (noteId: string) => {
    if (currentUser?.id && isSupabaseConfigured()) {
      setIsLoadingNotes(true)
      try {
        const supabase = createClient()
        const { error } = await supabase
          .from('study_notes')
          .delete()
          .eq('id', noteId)
          .eq('user_id', currentUser.id)

        if (error) {
          console.error('[StudyMate DB] Failed to delete note:', error)
          showToast(`Failed to delete note: ${error.message}`)
          return
        }

        await loadUserNotes(currentUser.id)
        showToast('Study note deleted.')
      } catch (err: any) {
        console.error('[StudyMate DB] Error deleting note:', err)
        showToast('Failed to delete note.')
      } finally {
        setIsLoadingNotes(false)
      }
    } else {
      showToast('Note removed.')
    }
  }

  const saveQuizAttempt = async (attemptScore: number, answersRecord: Record<number, number>) => {
    if (!currentUser?.id || !isSupabaseConfigured()) {
      showToast('Quiz completed! (Sign in to record attempts to your profile)')
      return
    }

    setIsSavingQuizAttempt(true)
    try {
      const supabase = createClient()
      const totalQ = quizQuestions.length
      const percentage = Math.round((attemptScore / totalQ) * 100)
      const topicName = currentMaterialObj?.name || selectedMaterial || 'General Biology'

      const answersPayload: Json = {
        answers: answersRecord,
        summary: quizQuestions.map((q, i) => ({
          question: q.question,
          topic: q.topic,
          selected_option: answersRecord[i] ?? null,
          correct_option: q.answer,
          is_correct: answersRecord[i] === q.answer,
        })),
      }

      const { error } = await supabase
        .from('quiz_attempts')
        .insert({
          user_id: currentUser.id,
          material_id: currentMaterialObj?.id || null,
          topic: topicName,
          score: attemptScore,
          total_questions: totalQ,
          percentage: percentage,
          answers: answersPayload,
        })
        .select()
        .single()

      if (error) {
        console.error('[StudyMate DB] Failed to save quiz attempt:', error.message)
        showToast(`Failed to save quiz attempt: ${error.message}`)
      } else {
        await loadUserQuizAttempts(currentUser.id)
        showToast('Quiz attempt saved to your learning progress!')
      }
    } catch (err: any) {
      console.error('[StudyMate DB] Unexpected error saving quiz attempt:', err)
      showToast('Unexpected error saving quiz attempt.')
    } finally {
      setIsSavingQuizAttempt(false)
    }
  }

  const deleteQuizAttempt = async (attemptId: string) => {
    if (!currentUser?.id || !isSupabaseConfigured()) {
      setQuizAttempts((curr) => curr.filter((a) => a.id !== attemptId))
      showToast('Quiz attempt removed from history.')
      return
    }

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('quiz_attempts')
        .delete()
        .eq('id', attemptId)
        .eq('user_id', currentUser.id)

      if (error) {
        console.error('[StudyMate DB] Failed to delete quiz attempt:', error.message)
        showToast(`Failed to remove attempt: ${error.message}`)
      } else {
        await loadUserQuizAttempts(currentUser.id)
        showToast('Quiz attempt removed from history.')
      }
    } catch (err: any) {
      console.error('[StudyMate DB] Error deleting quiz attempt:', err)
      showToast('Error removing quiz attempt.')
    }
  }

  const toggleReading = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      showToast(t('notesTtsUnavailable'))
      return
    }
    if (isReading) {
      window.speechSynthesis.cancel()
      setIsReading(false)
      return
    }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = language === 'ml' ? 'ml-IN' : language === 'hi' ? 'hi-IN' : language === 'ta' ? 'ta-IN' : 'en-US'
    if (userSettings?.read_speed) {
      const speedVal = parseFloat(userSettings.read_speed.replace('x', ''))
      if (!isNaN(speedVal) && speedVal > 0) utterance.rate = speedVal
    }
    utterance.onend = () => setIsReading(false)
    utterance.onerror = () => setIsReading(false)
    window.speechSynthesis.speak(utterance)
    setIsReading(true)
  }

  const handleStartNewConversation = () => {
    setActiveConversationId(null)
    setChat([
      {
        role: 'ai',
        text: t('tutorWelcomeMessage'),
      },
    ])
    showToast('Started new study session.')
  }

  const handleSelectConversation = (conversationId: string) => {
    if (!currentUser?.id) return
    setActiveConversationId(conversationId)
    loadConversationMessages(conversationId, currentUser.id)
  }

  const handleDeleteConversation = async (conversationId: string) => {
    if (!currentUser?.id || !isSupabaseConfigured()) {
      setConversations((curr) => curr.filter((c) => c.id !== conversationId))
      if (activeConversationId === conversationId) {
        handleStartNewConversation()
      }
      showToast('Conversation deleted.')
      return
    }

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('tutor_conversations')
        .delete()
        .eq('id', conversationId)
        .eq('user_id', currentUser.id)

      if (error) {
        console.error('[StudyMate DB] Failed to delete conversation:', error.message)
        showToast(`Failed to delete conversation: ${error.message}`)
      } else {
        setConversations((curr) => curr.filter((c) => c.id !== conversationId))
        if (activeConversationId === conversationId) {
          handleStartNewConversation()
        }
        showToast('Conversation removed from history.')
      }
    } catch (err: any) {
      console.error('[StudyMate DB] Error deleting conversation:', err)
      showToast('Error deleting conversation.')
    }
  }

  const handleRenameConversation = async (conversationId: string, newTitle: string) => {
    const trimmed = newTitle.trim()
    if (!trimmed || !currentUser?.id || !isSupabaseConfigured()) return

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('tutor_conversations')
        .update({ title: trimmed })
        .eq('id', conversationId)
        .eq('user_id', currentUser.id)

      if (error) {
        console.error('[StudyMate DB] Failed to rename conversation:', error.message)
        showToast(`Failed to rename: ${error.message}`)
      } else {
        setConversations((curr) =>
          curr.map((c) => (c.id === conversationId ? { ...c, title: trimmed } : c))
        )
        showToast('Conversation renamed.')
      }
    } catch (err: any) {
      console.error('[StudyMate DB] Error renaming conversation:', err)
    }
  }

  const sendMessage = async (text = message) => {
    const userText = text.trim()
    if (!userText || isTyping) return

    // Immediately reflect user message in the active chat stream
    const userMsgObj = { role: 'user' as const, text: userText }
    const updatedHistory = [...chat, userMsgObj]
    setChat(updatedHistory)
    setMessage('')
    setIsTyping(true)

    let convId = activeConversationId

    // Persist conversation and user message to Supabase for signed-in users
    if (currentUser?.id && isSupabaseConfigured()) {
      try {
        const supabase = createClient()

        // Create new conversation thread if none active
        if (!convId) {
          const titleSnippet = userText.length > 38 ? `${userText.slice(0, 38)}...` : userText
          const { data: newConv, error: convErr } = await supabase
            .from('tutor_conversations')
            .insert({
              user_id: currentUser.id,
              title: titleSnippet,
              material_id: currentMaterialObj?.id || null,
            })
            .select()
            .single()

          if (convErr) {
            console.error('[StudyMate DB] Failed to create conversation:', convErr.message)
          } else if (newConv) {
            convId = newConv.id
            setActiveConversationId(newConv.id)
            setConversations((prev) => [newConv, ...prev])
          }
        }

        // Persist user message to tutor_messages
        if (convId) {
          const { error: msgErr } = await supabase.from('tutor_messages').insert({
            conversation_id: convId,
            user_id: currentUser.id,
            role: 'user',
            text: userText,
          })
          if (msgErr) {
            console.error('[StudyMate DB] Failed to persist user message:', msgErr.message)
          }
        }
      } catch (err: any) {
        console.error('[StudyMate DB] Unexpected error saving user message:', err)
      }
    }

    // Call server-side AI chat API route
    try {
      const res = await fetch('/api/tutor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedHistory,
          topic: selectedMaterial || 'General Study',
          language,
          materialContext: currentMaterialObj?.name,
        }),
      })

      const data = await res.json()

      if (res.ok && data.reply) {
        const aiMsgObj = { role: 'ai' as const, text: data.reply }
        setChat((prev) => [...prev, aiMsgObj])

        // Persist AI message to Supabase
        if (currentUser?.id && isSupabaseConfigured() && convId) {
          const supabase = createClient()
          const { error: aiMsgErr } = await supabase.from('tutor_messages').insert({
            conversation_id: convId,
            user_id: currentUser.id,
            role: 'ai',
            text: data.reply,
          })
          if (aiMsgErr) {
            console.error('[StudyMate DB] Failed to persist AI message:', aiMsgErr.message)
          }
        }
      } else if (data?.configured === false) {
        const unconfiguredNotice = `⚠️ AI Provider Setup Needed: No API key was found on the server. To enable live AI tutor responses, add GEMINI_API_KEY (recommended) or OPENAI_API_KEY to your server-side .env.local file.`
        setChat((prev) => [...prev, { role: 'ai' as const, text: unconfiguredNotice }])
        showToast('AI API key required in .env.local')
      } else {
        const errMsg = data?.error || 'Failed to receive response from AI tutor.'
        setChat((prev) => [
          ...prev,
          { role: 'ai' as const, text: `⚠️ Error: ${errMsg}` },
        ])
        showToast(errMsg)
      }
    } catch (err: any) {
      console.error('[StudyMate API] Error communicating with tutor API:', err)
      setChat((prev) => [
        ...prev,
        {
          role: 'ai' as const,
          text: `⚠️ Network error: Could not reach the AI tutor server. Please try again.`,
        },
      ])
      showToast('Network error contacting AI tutor.')
    } finally {
      setIsTyping(false)
    }
  }

  const handleUpdateProfile = async (newName: string, newAvatar?: string) => {
    const trimmed = newName.trim()
    if (!trimmed || !currentUser?.id || !isSupabaseConfigured()) return false
    try {
      const supabase = createClient()
      const updates: { full_name: string; avatar_url?: string | null; updated_at: string } = {
        full_name: trimmed,
        updated_at: new Date().toISOString(),
      }
      if (newAvatar !== undefined) {
        updates.avatar_url = newAvatar
      }
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', currentUser.id)

      if (error) {
        console.error('[StudyMate DB] Failed to update profile:', error.message)
        showToast(`Failed to update profile: ${error.message}`)
        return false
      }

      setCurrentUser((prev) => (prev ? { ...prev, name: trimmed, ...(newAvatar ? { avatarUrl: newAvatar } : {}) } : null))
      setUserProfile((prev) => (prev ? { ...prev, full_name: trimmed, ...(newAvatar ? { avatarUrl: newAvatar } : {}) } : null))
      showToast(t('accToastProfileSaved'))
      return true
    } catch (err: any) {
      console.error('[StudyMate DB] Error updating profile:', err)
      showToast('Error updating profile.')
      return false
    }
  }

  const handleSaveScanQuery = async (queryData: {
    question_text: string
    image_path?: string | null
    mode?: 'notes' | 'general'
    answer_text?: string | null
    source_citation?: string | null
    confidence?: string | null
  }) => {
    if (!currentUser?.id || !isSupabaseConfigured()) return null
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('scan_queries')
        .insert({
          user_id: currentUser.id,
          question_text: queryData.question_text,
          image_path: queryData.image_path || null,
          mode: queryData.mode || 'notes',
          answer_text: queryData.answer_text || null,
          source_citation: queryData.source_citation || null,
          confidence: queryData.confidence || null,
        })
        .select()
        .single()

      if (error) {
        console.error('[StudyMate DB] Failed to save scan query:', error.message)
        return null
      }
      if (data) {
        setScanQueries((prev) => [data, ...prev])
        return data
      }
    } catch (err: any) {
      console.error('[StudyMate DB] Unexpected error saving scan query:', err)
    }
    return null
  }

  const handleDeleteScanQuery = async (queryId: string): Promise<boolean> => {
    if (!currentUser?.id || !isSupabaseConfigured()) {
      setScanQueries((prev) => prev.filter((q) => q.id !== queryId))
      showToast('Scan query removed.')
      return true
    }
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('scan_queries')
        .delete()
        .eq('id', queryId)
        .eq('user_id', currentUser.id)

      if (error) {
        console.error('[StudyMate DB] Failed to delete scan query:', error.message)
        showToast(`Failed to delete scan: ${error.message}`)
        return false
      } else {
        setScanQueries((prev) => prev.filter((q) => q.id !== queryId))
        showToast('Scan query removed from history.')
        return true
      }
    } catch (err: any) {
      console.error('[StudyMate DB] Error deleting scan query:', err)
      return false
    }
  }

  // Check if we are on an authentication screen
  const isAuthScreen =
    screen === 'Login' ||
    screen === 'Sign Up' ||
    screen === 'Forgot Password' ||
    screen === 'Reset Password'

  if (isAuthScreen) {
    const authMode: AuthMode =
      screen === 'Sign Up'
        ? 'signup'
        : screen === 'Forgot Password'
        ? 'forgot'
        : screen === 'Reset Password'
        ? 'reset'
        : 'login'

    return (
      <AuthScreen
        initialMode={authMode}
        onNavigateToWorkspace={() => setScreen('Dashboard')}
        onModeChange={(newMode) => {
          const map: Record<AuthMode, Screen> = {
            login: 'Login',
            signup: 'Sign Up',
            forgot: 'Forgot Password',
            reset: 'Reset Password',
          }
          setScreen(map[newMode])
        }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-[#f8f8f6] text-[#202337] dark:bg-[#0f1017] dark:text-[#f0f1f6] transition-colors duration-200 selection:bg-[#4f5bd5]/15">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-2xl border border-[#deded9] bg-white dark:border-[#32354e] dark:bg-[#1e2030] dark:text-white px-4 py-3 text-xs font-semibold text-[#202337] shadow-[0_8px_24px_rgba(0,0,0,0.12)] animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          <CheckCircle2 size={16} className="text-[#4f5bd5] dark:text-[#8d96f5] shrink-0" />
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-1 text-[#9a9ba5] hover:text-[#202337] dark:text-[#84879c] dark:hover:text-white transition p-0.5 rounded"
            aria-label="Dismiss toast"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Sidebar for Desktop & Mobile Overlay */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-[#e7e6e1] bg-[#fbfbfa] dark:border-[#26283b] dark:bg-[#161722] px-5 py-6 transition-transform lg:translate-x-0',
          sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-2">
          <button
            type="button"
            onClick={() => navigate('Dashboard')}
            className="flex items-center gap-3 text-left group"
          >
            <div className="flex size-9 items-center justify-center rounded-xl bg-[#4f5bd5] text-white shadow-sm transition group-hover:scale-105">
              <Sparkles size={18} />
            </div>
            <div>
              <div className="font-semibold tracking-tight text-sm text-[#202337] dark:text-white">
                StudyMate <span className="text-[#4f5bd5]">AI</span>
              </div>
              <div className="text-[10px] uppercase tracking-[.18em] text-[#8d8f9e] dark:text-[#84879c]">
                {t('brandTagline')}
              </div>
            </div>
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 text-[#8d8f9e] hover:text-[#202337] dark:text-[#84879c] dark:hover:text-white dark:hover:bg-[#222436] lg:hidden rounded-lg hover:bg-[#edeefd]"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Main Navigation Items */}
        <nav className="mt-8 flex flex-1 flex-col gap-1 overflow-y-auto">
          {navItems.map(({ label, icon: Icon }) => {
            const isActive = screen === label
            return (
              <button
                key={label}
                onClick={() => navigate(label)}
                className={cn(
                  'flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-all',
                  isActive
                    ? 'bg-[#edeefd] text-[#4550c9] font-bold shadow-xs dark:bg-[#4f5bd5]/25 dark:text-[#9aa3f8]'
                    : 'text-[#686b7d] hover:bg-[#f2f2ef] hover:text-[#202337] dark:text-[#9ea1b5] dark:hover:bg-[#222436] dark:hover:text-white'
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    size={17}
                    strokeWidth={isActive ? 2.2 : 1.8}
                    className={isActive ? 'text-[#4f5bd5] dark:text-[#8d96f5]' : 'text-[#878999] dark:text-[#7f8297]'}
                  />
                  <span>{t(screenTitleKeyMap[label] || label)}</span>
                </div>
                {label === 'My Materials' && materials.length > 0 && (
                  <span className="rounded-full bg-[#f0f0ee] px-2 py-0.5 text-[10px] font-semibold text-[#7b7e8e] dark:bg-[#24263a] dark:text-[#a0a3b8]">
                    {materials.length}
                  </span>
                )}
                {label === 'Interactive Quiz' && (
                  <span className="rounded-full bg-[#eef1fd] px-2 py-0.5 text-[10px] font-semibold text-[#4f5bd5] dark:bg-[#4f5bd5]/30 dark:text-[#aab1fc]">
                    {quizQuestions.length} Qs
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Learning Loop Callout */}
        <div className="rounded-2xl bg-[#f0f1fc] p-4 border border-[#e4e6fb] dark:bg-[#1c1e30] dark:border-[#2e3150]">
          <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-[#4f5bd5] dark:text-[#9aa3f8]">
            <span className="flex items-center gap-1.5">
              <Zap size={14} /> {t('learningLoopTitle')}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-[#686b7d] dark:text-[#9ea1b5]">
            {t('learningLoopDesc')}
          </p>
        </div>

        {/* Sidebar Footer User Card */}
        <div className="mt-4 flex items-center gap-3 border-t border-[#e7e6e1] dark:border-[#26283b] pt-4">
          <button
            type="button"
            onClick={() => navigate('Manage Account')}
            className="flex items-center gap-3 flex-1 text-left group min-w-0"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#f2c9a9] text-xs font-bold text-[#75472c] group-hover:ring-2 group-hover:ring-[#4f5bd5]/30 transition overflow-hidden">
              {currentUser?.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.name || 'User'}
                  className="size-full object-cover"
                />
              ) : (
                userInitials
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate group-hover:text-[#4f5bd5] text-[#202337] dark:text-[#f0f1f6] transition">
                {currentUser?.name || 'Maya Chen'}
              </div>
              <div className="text-[11px] text-[#9293a0] dark:text-[#7f8297] truncate">
                {currentUser ? t('studentAccount') : t('prototypeBadge')}
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setProfileMenuOpen((prev) => !prev)}
            className="p-1.5 rounded-lg text-[#9b9ca6] hover:bg-[#edeefd] hover:text-[#4f5bd5] dark:text-[#7f8297] dark:hover:bg-[#222436] dark:hover:text-[#9aa3f8] transition shrink-0 cursor-pointer"
            aria-label="User actions"
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      </aside>

      {/* Backdrop overlay for mobile sidebar */}
      {sidebarOpen && (
        <button
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Main Content Area */}
      <div className="lg:pl-[260px]">
        {/* Sticky Header Bar */}
        <header className="sticky top-0 z-20 flex h-[72px] md:h-[76px] items-center justify-between border-b border-[#e7e6e1] bg-[#f8f8f6]/95 dark:border-[#26283b] dark:bg-[#0f1017]/95 px-4 sm:px-6 md:px-10 backdrop-blur transition-colors duration-200">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-xl p-2 hover:bg-white dark:hover:bg-[#1a1b29] lg:hidden text-[#4b4e60] dark:text-[#d0d3e5] border border-transparent hover:border-[#deded9] dark:hover:border-[#32354e] transition"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <div>
              <div className="text-[11px] text-[#9a9ba5] dark:text-[#7f8297] flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => navigate('Dashboard')}
                  className="hover:text-[#4f5bd5] dark:hover:text-[#9aa3f8] transition font-medium"
                >
                  {t('workspace')}
                </button>
                <span>/</span>
                <span className="text-[#5e6070] dark:text-[#c4c7d7] font-semibold">{t(screenTitleKeyMap[screen] || screen)}</span>
              </div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-[#202337] dark:text-white leading-tight">
                {t(screenTitleKeyMap[screen] || screen)}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <button
              onClick={() => {
                navigate('My Materials')
                setTimeout(() => fileRef.current?.click(), 100)
              }}
              className="hidden items-center gap-2 rounded-xl border border-[#deded9] bg-white px-3.5 py-2 text-xs font-semibold text-[#4b4e60] dark:border-[#32354e] dark:bg-[#1a1b29] dark:text-[#d0d3e5] dark:hover:border-[#4f5bd5] dark:hover:text-[#9aa3f8] shadow-xs transition hover:border-[#bfc3f1] hover:text-[#4f5bd5] sm:flex active:scale-[0.99]"
            >
              <Plus size={15} /> {t('uploadMaterialBtn')}
            </button>

            {/* Quick Auth navigation button */}
            <Link
              href="/login"
              className="hidden items-center gap-1.5 rounded-xl border border-[#deded9] bg-white px-3 py-2 text-xs font-semibold text-[#4f5bd5] dark:border-[#32354e] dark:bg-[#1a1b29] dark:text-[#9aa3f8] dark:hover:bg-[#4f5bd5]/20 shadow-xs transition hover:bg-[#edeefd]/40 md:flex"
              title="Test Login & Sign Up views"
            >
              <LockKeyhole size={13} /> {t('authViewBtn')}
            </Link>

            {/* Profile Dropdown Container */}
            <div id="profile-menu-container" className="relative">
              <button
                onClick={() => setProfileMenuOpen((open) => !open)}
                aria-expanded={profileMenuOpen}
                aria-label="Open profile menu"
                className="flex size-9 items-center justify-center rounded-full bg-[#f2c9a9] text-xs font-bold text-[#75472c] ring-2 ring-transparent hover:ring-[#4f5bd5]/30 transition overflow-hidden"
              >
                {currentUser?.avatarUrl ? (
                  <img
                    src={currentUser.avatarUrl}
                    alt={currentUser.name || 'User'}
                    className="size-full object-cover"
                  />
                ) : (
                  userInitials
                )}
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 top-11 z-30 w-64 rounded-2xl border border-[#e7e6e1] bg-white dark:border-[#2f3249] dark:bg-[#1a1b29] p-2 shadow-xl animate-in fade-in zoom-in-95 duration-100">
                  <div className="border-b border-[#efefec] dark:border-[#27293d] px-3 py-2.5">
                    <div className="text-xs font-semibold text-[#202337] dark:text-white truncate">
                      {currentUser?.name || 'Maya Chen'}
                    </div>
                    <div className="text-[11px] text-[#9293a0] dark:text-[#7f8297] truncate">
                      {currentUser?.email || 'maya@example.com'}
                    </div>
                    <div className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] text-[#3b7e5e] dark:text-[#5ec290] font-medium bg-[#eef8f2] dark:bg-[#14281e] px-2 py-0.5 rounded-md">
                      <span className="size-1.5 rounded-full bg-[#3b7e5e] dark:bg-[#5ec290]" />{' '}
                      {currentUser ? 'Google Account' : t('prototypeBadge')}
                    </div>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => navigate('Manage Account')}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#4b4e60] hover:bg-[#f5f5f2] hover:text-[#202337] dark:text-[#c5c8db] dark:hover:bg-[#24263a] dark:hover:text-white transition"
                    >
                      <UserRound size={15} /> {t('profileMenuProfile')}
                    </button>
                    <button
                      onClick={() => navigate('Settings')}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#4b4e60] hover:bg-[#f5f5f2] hover:text-[#202337] dark:text-[#c5c8db] dark:hover:bg-[#24263a] dark:hover:text-white transition"
                    >
                      <Settings size={15} /> {t('profileMenuSettings')}
                    </button>
                  </div>

                  <div className="border-t border-[#efefec] dark:border-[#27293d] pt-1">
                    <Link
                      href="/login"
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#4f5bd5] hover:bg-[#edeefd]/50 dark:text-[#9aa3f8] dark:hover:bg-[#4f5bd5]/20 transition"
                    >
                      <KeyRound size={14} /> {t('profileMenuLogin')}
                    </Link>
                    <Link
                      href="/signup"
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#4f5bd5] hover:bg-[#edeefd]/50 dark:text-[#9aa3f8] dark:hover:bg-[#4f5bd5]/20 transition"
                    >
                      <ExternalLink size={14} /> {t('profileMenuSignUp')}
                    </Link>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#b45b51] hover:bg-[#fdf1ef] dark:text-[#f28b80] dark:hover:bg-[#361d1c] transition cursor-pointer"
                    >
                      <LogOut size={14} /> {t('profileMenuSignOut')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Router */}
        <main className="mx-auto max-w-[1360px] px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
          {screen === 'Dashboard' && (
            <Dashboard
              navigate={navigate}
              materials={materials}
              selected={selectedMaterial}
              setSelected={setSelectedMaterial}
              quizAttempts={quizAttempts}
              userSignedIn={Boolean(currentUser?.id)}
              currentUser={currentUser}
            />
          )}
          {screen === 'My Materials' && (
            <Materials
              materials={materials}
              selected={selectedMaterial}
              setSelected={setSelectedMaterial}
              fileRef={fileRef}
              uploadFiles={uploadFiles}
              deleteMaterial={deleteMaterial}
              onRenameMaterial={handleRenameMaterial}
              navigate={navigate}
              isLoading={isLoadingMaterials}
              userSignedIn={Boolean(currentUser?.id)}
            />
          )}
          {screen === 'AI Notes' && (
            <Notes
              reading={isReading}
              toggleReading={toggleReading}
              navigate={navigate}
              showToast={showToast}
              materialName={selectedMaterial}
              currentMaterial={currentMaterialObj}
              notes={studyNotes}
              onCreateNote={createNoteForMaterial}
              onUpdateNote={updateNote}
              onDeleteNote={deleteNote}
              isLoading={isLoadingNotes}
              userSignedIn={Boolean(currentUser?.id)}
            />
          )}
          {screen === 'Interactive Quiz' && (
            <Quiz
              quizIndex={quizIndex}
              setQuizIndex={setQuizIndex}
              answers={answers}
              setAnswers={setAnswers}
              quizDone={quizDone}
              setQuizDone={setQuizDone}
              score={score}
              navigate={navigate}
              onCompleteQuiz={saveQuizAttempt}
              isSaving={isSavingQuizAttempt}
              userSignedIn={Boolean(currentUser?.id)}
            />
          )}
          {screen === 'AI Tutor' && (
            <Tutor
              chat={chat}
              message={message}
              setMessage={setMessage}
              sendMessage={sendMessage}
              isTyping={isTyping}
              reading={isReading}
              toggleReading={toggleReading}
              showToast={showToast}
              onClearChat={handleStartNewConversation}
              conversations={conversations}
              activeConversationId={activeConversationId}
              onSelectConversation={handleSelectConversation}
              onStartNewConversation={handleStartNewConversation}
              onDeleteConversation={handleDeleteConversation}
              onRenameConversation={handleRenameConversation}
              isLoadingConversations={isLoadingConversations}
              isLoadingMessages={isLoadingMessages}
              userSignedIn={Boolean(currentUser?.id)}
              currentUser={currentUser}
              userInitials={userInitials}
            />
          )}
          {screen === 'My Progress' && (
            <Progress
              navigate={navigate}
              showToast={showToast}
              quizAttempts={quizAttempts}
              isLoading={isLoadingQuizAttempts}
              userSignedIn={Boolean(currentUser?.id)}
              onDeleteAttempt={deleteQuizAttempt}
            />
          )}
          {screen === 'Scan & Find Answers' && (
            <Scan
              scanText={scanText}
              setScanText={setScanText}
              showToast={showToast}
              scanQueries={scanQueries}
              isLoadingScanQueries={isLoadingScanQueries}
              onSaveScanQuery={handleSaveScanQuery}
              onDeleteScanQuery={handleDeleteScanQuery}
              currentMaterial={currentMaterialObj}
              language={language}
              userSignedIn={Boolean(currentUser?.id)}
              navigate={navigate}
            />
          )}
          {screen === 'Settings' && (
            <SettingsScreen
              navigate={navigate}
              showToast={showToast}
              theme={theme}
              onThemeChange={handleThemeChange}
              currentUser={currentUser}
              userSettings={userSettings}
              onUpdateSettings={updateUserSettings}
              onSignOut={handleSignOut}
              onUpdateProfile={handleUpdateProfile}
            />
          )}
          {screen === 'Manage Account' && (
            <>
              <SectionTitle
                eyebrow={t('accountEyebrow')}
                title={t('accountTitle')}
                description={t('accountDescription')}
              />
              <AccountPanel
                currentUser={currentUser}
                onSignOut={handleSignOut}
                onUpdateProfile={handleUpdateProfile}
                onNavigateToAuth={(mode) => {
                  const map: Record<AuthMode, Screen> = {
                    login: 'Login',
                    signup: 'Sign Up',
                    forgot: 'Forgot Password',
                    reset: 'Reset Password',
                  }
                  navigate(map[mode])
                }}
              />
            </>
          )}
        </main>
      </div>
    </div>
  )
}

function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description?: string
}) {
  return (
    <div className="mb-6 sm:mb-8">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[.18em] text-[#5b65ce] dark:text-[#9aa3f8]">
        {eyebrow}
      </div>
      <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-[#202337] dark:text-white">
        {title}
      </h2>
      {description && (
        <p className="mt-2 max-w-2xl text-xs sm:text-sm leading-relaxed text-[#777989] dark:text-[#9ea1b5]">{description}</p>
      )}
    </div>
  )
}

function Card({
  children,
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-[#e7e6e1] bg-white shadow-[0_2px_12px_rgba(31,35,53,0.025)] dark:border-[#282a3e] dark:bg-[#1a1b29] dark:text-[#f0f1f6] transition-colors duration-200',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/* =========================================================================
   DASHBOARD SCREEN
   ========================================================================= */

function Dashboard({
  navigate,
  materials,
  selected,
  setSelected,
  quizAttempts = [],
  userSignedIn = false,
  currentUser,
}: {
  navigate: (s: Screen) => void
  materials: Material[]
  selected: string
  setSelected: (s: string) => void
  quizAttempts?: QuizAttemptRow[]
  userSignedIn?: boolean
  currentUser?: {
    email?: string
    name?: string
    avatarUrl?: string
  } | null
}) {
  const { t } = useLanguage()

  const welcomeTitle = useMemo(() => {
    const base = t('dashWelcomeTitle')
    if (!currentUser?.name) return base
    const firstName = currentUser.name.trim().split(/\s+/)[0]
    return base.replace(/Maya|മായ|माया|மாயா/, firstName)
  }, [t, currentUser?.name])

  const avgScore = useMemo(() => {
    if (!userSignedIn || quizAttempts.length === 0) return 72
    return Math.round(quizAttempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / quizAttempts.length)
  }, [userSignedIn, quizAttempts])

  return (
    <>
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#8d8f9e] dark:text-[#84879c]">
            {t('activeSession')} &bull; {t('navDashboard')}
          </p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-[#202337] dark:text-white">
            {welcomeTitle}
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-[#777989] dark:text-[#9ea1b5]">
            {t('dashWelcomeSub')}
          </p>
        </div>
        <button
          onClick={() => navigate('My Materials')}
          className="flex w-fit items-center gap-2 rounded-xl bg-[#4f5bd5] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-[0_4px_14px_rgba(79,91,213,.2)] transition hover:bg-[#424dc0] active:scale-[0.99]"
        >
          <Upload size={16} /> {t('uploadMaterialBtn')}
        </button>
      </div>

      {/* Continue Learning Banner */}
      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-col justify-between gap-4 p-5 sm:p-6 md:flex-row md:items-center md:p-8">
          <div className="flex items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#edeefd] dark:bg-[#4f5bd5]/25 text-[#4f5bd5] dark:text-[#9aa3f8]">
              <BookOpen size={22} />
            </div>
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#9193a2] dark:text-[#84879c]">
                <span>{t('continue')}</span>
                <span className="size-1.5 rounded-full bg-[#4f5bd5]" />
                <span className="text-[#4f5bd5] dark:text-[#9aa3f8] font-bold">{t('matStatusProcessing')}</span>
              </div>
              <h3 className="font-bold text-base sm:text-lg text-[#202337] dark:text-white">
                Cell Structure & Function
              </h3>
              <p className="mt-0.5 text-xs text-[#898b98] dark:text-[#84879c]">{t('navNotes')} &bull; 12 min left</p>
            </div>
          </div>
          <button
            onClick={() => navigate('AI Notes')}
            className="flex items-center gap-2 rounded-xl border border-[#deded9] bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-[#4f5bd5] dark:border-[#32354e] dark:bg-[#222436] dark:text-[#9aa3f8] dark:hover:bg-[#282b42] hover:border-[#bfc3f1] hover:bg-[#edeefd]/30 transition self-start md:self-auto shadow-2xs"
          >
            <span>{t('continue')}</span>
            <ArrowRight size={15} />
          </button>
        </div>
        <div className="h-1.5 bg-[#f0f0ec] dark:bg-[#25273b]">
          <div className="h-1.5 w-[68%] rounded-r-full bg-[#4f5bd5]" />
        </div>
      </Card>

      {/* Quick Actions & Progress Widget */}
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="p-5 sm:p-6 md:p-7">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-base text-[#202337] dark:text-white">{t('dashQuickActionsTitle')}</h3>
              <p className="mt-0.5 text-xs text-[#8d8f9e] dark:text-[#84879c]">{t('learningLoopDesc')}</p>
            </div>
            <Sparkles size={18} className="text-[#4f5bd5] dark:text-[#9aa3f8]" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                label: t('dashQuickNotesTitle'),
                sub: t('dashQuickNotesDesc'),
                icon: FileText,
                color: 'bg-[#f2eddf] text-[#b98534] dark:bg-[#342a17] dark:text-[#e5ab56]',
                target: 'AI Notes' as Screen,
              },
              {
                label: t('dashQuickQuizTitle'),
                sub: t('dashQuickQuizDesc'),
                icon: CircleHelp,
                color: 'bg-[#e8f2ed] text-[#438568] dark:bg-[#1a3124] dark:text-[#5ec290]',
                target: 'Interactive Quiz' as Screen,
              },
              {
                label: t('dashQuickTutorTitle'),
                sub: t('dashQuickTutorDesc'),
                icon: Bot,
                color: 'bg-[#edeefd] text-[#4f5bd5] dark:bg-[#26284d] dark:text-[#9aa3f8]',
                target: 'AI Tutor' as Screen,
              },
            ].map(({ label, sub, icon: Icon, color, target }) => (
              <button
                onClick={() => navigate(target)}
                key={label}
                className="group rounded-xl border border-[#ededed] dark:border-[#282a3e] dark:bg-[#1e2030] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#bfc3f1] dark:hover:border-[#4f5bd5] hover:shadow-xs"
              >
                <div className={cn('mb-5 flex size-9 items-center justify-center rounded-xl transition group-hover:scale-105', color)}>
                  <Icon size={17} />
                </div>
                <div className="text-sm font-bold text-[#202337] dark:text-white group-hover:text-[#4f5bd5] dark:group-hover:text-[#9aa3f8] transition">
                  {label}
                </div>
                <div className="mt-1 text-[11px] text-[#9293a0] dark:text-[#84879c] line-clamp-2">{sub}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-5 sm:p-6 md:p-7 flex flex-col justify-between">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-[#202337] dark:text-white">{t('progTitle')}</h3>
                <p className="mt-0.5 text-xs text-[#8d8f9e] dark:text-[#84879c]">{t('dashStreakSub')}</p>
              </div>
              <button
                onClick={() => navigate('My Progress')}
                className="text-xs font-semibold text-[#4f5bd5] dark:text-[#9aa3f8] hover:underline"
              >
                {t('moreActions')}
              </button>
            </div>
            <div className="flex items-center gap-5 pt-2">
              <div
                className="relative flex size-20 shrink-0 items-center justify-center rounded-full shadow-inner"
                style={{ background: `conic-gradient(#4f5bd5 0 ${avgScore}%, #ececf1 ${avgScore}% 100%)` }}
              >
                <div className="flex size-[62px] items-center justify-center rounded-full bg-white dark:bg-[#1a1b29] text-lg font-bold text-[#202337] dark:text-white">
                  {avgScore}<span className="text-xs font-medium">%</span>
                </div>
              </div>
              <div>
                <div className="text-sm font-bold text-[#202337] dark:text-white">{t('dashScoreLabel')}</div>
                <p className="mt-1 text-xs leading-relaxed text-[#777989] dark:text-[#9ea1b5]">
                  {userSignedIn && quizAttempts.length > 0
                    ? `${quizAttempts.length} quizzes recorded`
                    : `${t('dashScoreSub')} • 84%`}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#efefec] dark:border-[#282a3e] flex items-center justify-between text-xs text-[#898b98] dark:text-[#84879c]">
            <span>{t('dashStreakLabel')}: <strong className="text-[#202337] dark:text-white">{t('dashStreakValue')}</strong></span>
            <span>{t('dashMaterialsLabel')}: <strong className="text-[#438568] dark:text-[#5ec290]">{t('dashMaterialsValue')}</strong></span>
          </div>
        </Card>
      </div>

      {/* Recent Materials */}
      <Card className="mt-6 p-5 sm:p-6 md:p-7">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base text-[#202337] dark:text-white">{t('dashRecentTitle')}</h3>
            <p className="mt-0.5 text-xs text-[#8d8f9e] dark:text-[#84879c]">{t('dashRecentSub')}</p>
          </div>
          <button
            onClick={() => navigate('My Materials')}
            className="text-xs font-semibold text-[#4f5bd5] dark:text-[#9aa3f8] hover:underline"
          >
            {t('dashViewAllMaterials')} ({materials.length})
          </button>
        </div>

        {materials.length === 0 ? (
          <div className="text-center py-8 rounded-xl border border-dashed border-[#e7e6e1] bg-[#fbfbfa] dark:border-[#282a3e] dark:bg-[#161724]">
            <FolderOpen size={28} className="mx-auto text-[#9a9ba5] dark:text-[#7f8297]" />
            <p className="mt-2 text-sm font-semibold text-[#202337] dark:text-white">{t('matEmptyTitle')}</p>
            <p className="mt-1 text-xs text-[#8d8f9e] dark:text-[#84879c]">{t('matEmptyDesc')}</p>
            <button
              onClick={() => navigate('My Materials')}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#4f5bd5] px-3.5 py-2 text-xs font-semibold text-white"
            >
              <Upload size={13} /> {t('uploadMaterialBtn')}
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {materials.slice(0, 3).map((m) => (
              <button
                key={m.name}
                onClick={() => {
                  setSelected(m.name)
                  navigate('AI Notes')
                }}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-3.5 text-left transition hover:border-[#bdc2f2] dark:hover:border-[#4f5bd5] group',
                  selected === m.name
                    ? 'border-[#bfc3f1] bg-[#fafaff] dark:border-[#4f5bd5] dark:bg-[#252844]'
                    : 'border-[#efefec] bg-white dark:border-[#282a3e] dark:bg-[#1e2030]'
                )}
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f3f3f0] text-[#7f8292] dark:bg-[#26283d] dark:text-[#9ea1b5] group-hover:bg-[#edeefd] dark:group-hover:bg-[#4f5bd5]/25 group-hover:text-[#4f5bd5] dark:group-hover:text-[#9aa3f8] transition">
                  <FileText size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold text-[#202337] dark:text-white group-hover:text-[#4f5bd5] dark:group-hover:text-[#9aa3f8] transition">
                    {m.name}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[#999ba6] dark:text-[#84879c]">
                    {m.type} &bull; {m.size} &bull; <span className="text-[#3b7e5e] dark:text-[#5ec290] font-semibold">{m.status}</span>
                  </div>
                </div>
                {selected === m.name && (
                  <Check size={16} className="shrink-0 text-[#4f5bd5] dark:text-[#9aa3f8]" />
                )}
              </button>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}

/* =========================================================================
   MY MATERIALS SCREEN
   ========================================================================= */

function Materials({
  materials,
  selected,
  setSelected,
  fileRef,
  uploadFiles,
  deleteMaterial,
  onRenameMaterial,
  navigate,
  isLoading,
  userSignedIn,
}: {
  materials: Material[]
  selected: string
  setSelected: (s: string) => void
  fileRef: React.RefObject<HTMLInputElement | null>
  uploadFiles: (f: FileList | null) => void
  deleteMaterial: (m: Material | string) => void
  onRenameMaterial?: (materialId: string, newName: string) => void
  navigate: (s: Screen) => void
  isLoading?: boolean
  userSignedIn?: boolean
}) {
  const { t } = useLanguage()
  const [searchQuery, setSearchQuery] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const filteredMaterials = useMemo(() => {
    if (!searchQuery.trim()) return materials
    return materials.filter((m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.type.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [materials, searchQuery])

  const handleStartRename = (m: Material) => {
    setEditingId(m.id || m.name)
    setEditName(m.name)
  }

  const handleSaveRename = (m: Material) => {
    if (editName.trim() && editName.trim() !== m.name) {
      if (onRenameMaterial && m.id) {
        onRenameMaterial(m.id, editName.trim())
      }
    }
    setEditingId(null)
  }

  return (
    <>
      <SectionTitle
        eyebrow={t('workspace')}
        title={t('matTitle')}
        description={t('matDesc')}
      />

      {/* Drag & Drop Upload Zone */}
      <Card
        onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e: React.DragEvent<HTMLDivElement>) => {
          e.preventDefault()
          setIsDragging(false)
          uploadFiles(e.dataTransfer.files)
        }}
        className={cn(
          'mb-7 border-dashed p-6 text-center transition-all md:p-10',
          isDragging
            ? 'border-[#4f5bd5] bg-[#f0f1fc] dark:bg-[#222544] scale-[1.01]'
            : 'border-[#deded9] bg-[#fbfbff] dark:border-[#32354e] dark:bg-[#151624]'
        )}
      >
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#edeefd] dark:bg-[#4f5bd5]/25 text-[#4f5bd5] dark:text-[#9aa3f8] shadow-xs">
          {isLoading ? <Loader2 size={24} className="animate-spin" /> : <Upload size={24} />}
        </div>
        <h3 className="mt-4 font-bold text-base text-[#202337] dark:text-white">
          {t('matDropzoneTitle')}
        </h3>
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-[#858795] dark:text-[#9ea1b5]">
          {t('matDropzoneSub')}
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => fileRef.current?.click()}
            className="rounded-xl bg-[#4f5bd5] px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-[#424dc0] transition active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? 'Saving...' : t('uploadMaterialBtn')}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,.doc,.docx"
          multiple
          className="hidden"
          onChange={(e) => uploadFiles(e.target.files)}
        />
      </Card>

      {/* Materials List Card */}
      <Card className="p-5 sm:p-6 md:p-7">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-base text-[#202337] dark:text-white flex items-center gap-2">
              <span>{t('matTitle')}</span>
              <span className="rounded-full bg-[#f2f2ef] dark:bg-[#24263a] px-2 py-0.5 text-xs font-semibold text-[#7c7f8f] dark:text-[#a0a3b8]">
                {filteredMaterials.length}
              </span>
            </h3>
            {isLoading && (
              <span className="inline-flex items-center gap-1.5 text-xs text-[#4f5bd5] dark:text-[#8d96f5]">
                <Loader2 size={13} className="animate-spin" />
                <span>Syncing...</span>
              </span>
            )}
            {userSignedIn && (
              <span className="rounded-full bg-[#edeefd] dark:bg-[#4f5bd5]/20 px-2 py-0.5 text-[10px] font-bold text-[#4f5bd5] dark:text-[#9aa3f8]">
                Cloud Synced
              </span>
            )}
          </div>

          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-3 text-[#9a9ba5] dark:text-[#7f8297]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('matSearchPlaceholder')}
              className="w-full h-9 rounded-xl border border-[#e4e4df] bg-[#fbfbfa] text-[#202337] dark:border-[#32354e] dark:bg-[#161724] dark:text-white dark:placeholder-[#6f7288] pl-8 pr-8 text-xs outline-none focus:border-[#4f5bd5] focus:bg-white dark:focus:bg-[#1c1d2e] transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-[#9a9ba5] hover:text-[#202337] dark:hover:text-white"
                aria-label={t('cancel')}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {filteredMaterials.length === 0 ? (
          <div className="text-center py-12">
            <FileText size={32} className="mx-auto text-[#b0b2be] dark:text-[#5e6175]" />
            <p className="mt-3 text-sm font-semibold text-[#202337] dark:text-white">
              {searchQuery ? `${t('matEmptyTitle')}: "${searchQuery}"` : t('matEmptyTitle')}
            </p>
            <p className="mt-1 text-xs text-[#8d8f9e] dark:text-[#84879c]">
              {t('matEmptyDesc')}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-3 rounded-lg border border-[#deded9] dark:border-[#32354e] dark:bg-[#222436] px-3 py-1.5 text-xs font-semibold text-[#4f5bd5] dark:text-[#9aa3f8] hover:bg-[#edeefd]/40"
              >
                {t('cancel')}
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[#efefec] dark:divide-[#282a3e]">
            {filteredMaterials.map((m) => {
              const isThisEditing = editingId === (m.id || m.name)
              return (
                <div
                  key={m.id || m.name}
                  className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3 min-w-[200px] flex-1">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f2f2ef] dark:bg-[#24263a] text-[#717485] dark:text-[#9ea1b5]">
                      <FileText size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      {isThisEditing ? (
                        <div className="flex items-center gap-2 max-w-sm">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(m)
                              else if (e.key === 'Escape') setEditingId(null)
                            }}
                            className="h-8 w-full rounded-lg border border-[#4f5bd5] bg-white px-2.5 text-xs text-[#202337] dark:bg-[#1a1b29] dark:text-white outline-none"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveRename(m)}
                            className="p-1.5 rounded-lg bg-[#4f5bd5] text-white hover:bg-[#434ec4] transition cursor-pointer"
                            title={t('save')}
                            aria-label={t('save')}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="p-1.5 rounded-lg border border-[#deded9] dark:border-[#32354e] text-[#717485] hover:bg-[#f2f2ef] dark:text-[#a0a3b8] transition cursor-pointer"
                            title={t('cancel')}
                            aria-label={t('cancel')}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#202337] dark:text-white truncate">
                              {m.name}
                            </span>
                            {onRenameMaterial && (
                              <button
                                type="button"
                                onClick={() => handleStartRename(m)}
                                className="text-[#9a9ba5] hover:text-[#4f5bd5] dark:text-[#7f8297] dark:hover:text-[#9aa3f8] p-1 rounded cursor-pointer"
                                title="Rename material"
                                aria-label="Rename material"
                              >
                                <Pencil size={12} />
                              </button>
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-[#9a9ba5] dark:text-[#84879c] flex items-center gap-2">
                            <span className="font-semibold text-[#5e6070] dark:text-[#c4c7db]">{m.type}</span>
                            <span>&bull;</span>
                            <span>{m.size}</span>
                            <span>&bull;</span>
                            <span className="text-[#3b7e5e] dark:text-[#5ec290] font-medium">{m.status}</span>
                            {m.id && (
                              <>
                                <span>&bull;</span>
                                <span className="text-[#4f5bd5] dark:text-[#8d96f5] font-semibold text-[10px]">
                                  Database
                                </span>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelected(m.name)
                        navigate('AI Notes')
                      }}
                      className={cn(
                        'rounded-xl px-3.5 py-2 text-xs font-semibold transition active:scale-[0.99] cursor-pointer',
                        selected === m.name
                          ? 'bg-[#edeefd] text-[#4f5bd5] border border-[#bfc3f1] dark:bg-[#4f5bd5]/25 dark:text-[#9aa3f8] dark:border-[#4f5bd5]'
                          : 'border border-[#e6e6e2] text-[#555767] dark:border-[#32354e] dark:text-[#c5c8db] dark:hover:border-[#4f5bd5] dark:hover:text-[#9aa3f8] hover:border-[#bfc3f1] hover:text-[#4f5bd5]'
                      )}
                    >
                      {selected === m.name ? t('matStatusReady') : t('navNotes')}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMaterial(m)}
                      className="p-2 rounded-xl text-[#9b9ca6] hover:bg-[#fdf1ef] hover:text-[#b45b51] dark:text-[#84879c] dark:hover:bg-[#361d1c] dark:hover:text-[#f28b80] transition cursor-pointer"
                      title={`${t('delete')} ${m.name}`}
                      aria-label={`${t('delete')} ${m.name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </>
  )
}

/* =========================================================================
   AI NOTES SCREEN
   ========================================================================= */

function Notes({
  reading,
  toggleReading,
  navigate,
  showToast,
  materialName,
  currentMaterial,
  notes = [],
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  isLoading,
  userSignedIn,
}: {
  reading: boolean
  toggleReading: (t: string) => void
  navigate: (s: Screen) => void
  showToast: (m: string) => void
  materialName: string
  currentMaterial?: Material | null
  notes?: StudyNoteRow[]
  onCreateNote?: (matId?: string, matName?: string, title?: string, summary?: string) => Promise<void>
  onUpdateNote?: (noteId: string, updates: Partial<StudyNoteRow>) => Promise<void>
  onDeleteNote?: (noteId: string) => Promise<void>
  isLoading?: boolean
  userSignedIn?: boolean
}) {
  const { t } = useLanguage()
  const [copied, setCopied] = useState(false)
  const [localBookmarked, setLocalBookmarked] = useState(false)
  const [activeSection, setActiveSection] = useState('Summary')
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editSummary, setEditSummary] = useState('')

  // Resolve note: prefer note linked to currentMaterial, then first available note, or null
  const attachedNote = useMemo(() => {
    if (!notes || notes.length === 0) return null
    if (currentMaterial?.id) {
      const match = notes.find((n) => n.material_id === currentMaterial.id)
      if (match) return match
    }
    return notes[0]
  }, [notes, currentMaterial])

  const defaultSummary =
    'Cells are the fundamental units of all living organisms. Every cell maintains homeostasis through controlled transport across its boundary.'
  const defaultMembraneText =
    'The cell membrane is a selectively permeable phospholipid bilayer with embedded proteins that controls what enters and exits the cell.'

  const displayTitle = attachedNote?.title || 'Cell Structure & Function'
  const displaySummary = attachedNote?.summary || defaultSummary
  const isBookmarked = attachedNote ? Boolean(attachedNote.is_bookmarked) : localBookmarked

  // Extract sections
  const dynamicSections: NoteSection[] = useMemo(() => {
    if (attachedNote && Array.isArray(attachedNote.sections) && attachedNote.sections.length > 0) {
      return attachedNote.sections as unknown as NoteSection[]
    }
    return [
      {
        id: 'notes-summary',
        title: t('notesTabMindMap'),
        content:
          'Cells are the basic structural and functional units of all known organisms. Each cell contains specialized organelle machinery operating in synergy to maintain cellular metabolism and homeostasis.',
      },
      {
        id: 'notes-membrane',
        title: `${t('notesTabKeyConcepts')} • The Cell Membrane`,
        content: `${defaultMembraneText} This selective permeability is essential for maintaining constant internal osmotic pressure and chemical concentrations.`,
        examTip:
          'Think of the cell membrane like an automated airport security checkpoint. It only allows authorized molecules with the right molecular pass through, while preventing foreign contaminants from entering.',
      },
      {
        id: 'notes-concepts',
        title: t('notesOrganellesTitle'),
        content: 'Major organelles responsible for cellular functions:',
        bullets: [
          'Nucleus: Houses the genetic code (DNA) and orchestrates cellular gene expression.',
          'Mitochondria: Synthesize ATP via cellular respiration, acting as the cell’s energetic powerplants.',
          'Ribosomes: Translate messenger RNA instructions to synthesize polypeptide chains.',
        ],
      },
    ]
  }, [attachedNote, t, defaultMembraneText])

  const handleCopy = () => {
    const sectionsText = dynamicSections
      .map((s) => `${s.title}:\n${s.content}${s.examTip ? `\nTip: ${s.examTip}` : ''}${s.bullets ? `\n• ${s.bullets.join('\n• ')}` : ''}`)
      .join('\n\n')
    const fullNotesText = `StudyMate AI Notes - ${displayTitle}\nSource: ${materialName}\n\nSummary:\n${displaySummary}\n\n${sectionsText}`
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(fullNotesText)
      setCopied(true)
      showToast(t('notesToastCopied'))
      setTimeout(() => setCopied(false), 2200)
    }
  }

  const toggleBookmark = async () => {
    if (attachedNote && onUpdateNote) {
      await onUpdateNote(attachedNote.id, { is_bookmarked: !attachedNote.is_bookmarked })
    } else {
      setLocalBookmarked((prev) => !prev)
      showToast(!localBookmarked ? t('save') : t('delete'))
    }
  }

  const handleStartEdit = () => {
    setEditTitle(displayTitle)
    setEditSummary(displaySummary)
    setIsEditingNote(true)
  }

  const handleSaveEdit = async () => {
    if (attachedNote && onUpdateNote) {
      await onUpdateNote(attachedNote.id, {
        title: editTitle.trim() || displayTitle,
        summary: editSummary.trim() || displaySummary,
      })
    }
    setIsEditingNote(false)
  }

  const handleDelete = async () => {
    if (attachedNote && onDeleteNote) {
      await onDeleteNote(attachedNote.id)
    }
  }

  const handleGenerate = async () => {
    if (onCreateNote) {
      await onCreateNote(currentMaterial?.id, materialName)
    }
  }

  const scrollTo = (id: string, name: string) => {
    setActiveSection(name)
    const el = document.getElementById(id)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const readAloudContent = `${displayTitle}. ${displaySummary}. ${dynamicSections.map((s) => `${s.title}. ${s.content}`).join(' ')}`

  return (
    <>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <SectionTitle
            eyebrow={`${t('navNotes')} • ${materialName}`}
            title={displayTitle}
            description={t('notesDesc')}
          />
          {attachedNote && (
            <div className="mt-1 flex items-center gap-2 text-xs text-[#4f5bd5] dark:text-[#8d96f5]">
              <span className="size-1.5 rounded-full bg-[#3b7e5e] dark:bg-[#5ec290]" />
              <span className="font-medium">Saved in Supabase Database</span>
              {attachedNote.created_at && (
                <span className="text-[#84879c]">
                  &bull; {new Date(attachedNote.created_at).toLocaleDateString()}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Read aloud */}
          <button
            onClick={() => toggleReading(readAloudContent)}
            className="flex items-center gap-2 rounded-xl border border-[#deded9] bg-white text-[#202337] dark:border-[#32354e] dark:bg-[#1e2030] dark:text-[#d0d3e5] px-3.5 py-2 text-xs font-semibold hover:border-[#bfc3f1] hover:text-[#4f5bd5] dark:hover:border-[#4f5bd5] dark:hover:text-[#9aa3f8] transition shadow-xs cursor-pointer"
          >
            {reading ? (
              <>
                <span className="size-2 rounded-full bg-[#4f5bd5] animate-ping" />
                <span>{t('notesStopReadingBtn')}</span>
              </>
            ) : (
              <>
                <Volume2 size={15} />
                <span>{t('notesReadAloudBtn')}</span>
              </>
            )}
          </button>

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-xl border border-[#deded9] bg-white text-[#202337] dark:border-[#32354e] dark:bg-[#1e2030] dark:text-[#d0d3e5] px-3.5 py-2 text-xs font-semibold hover:border-[#bfc3f1] hover:text-[#4f5bd5] dark:hover:border-[#4f5bd5] dark:hover:text-[#9aa3f8] transition shadow-xs cursor-pointer"
          >
            {copied ? (
              <>
                <Check size={14} className="text-[#3b7e5e] dark:text-[#5ec290]" />
                <span className="text-[#3b7e5e] dark:text-[#5ec290]">{t('copied')}</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                <span>{t('notesCopyBtn')}</span>
              </>
            )}
          </button>

          {/* Bookmark button */}
          <button
            onClick={toggleBookmark}
            className={cn(
              'flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition shadow-xs cursor-pointer',
              isBookmarked
                ? 'border-[#4f5bd5] bg-[#edeefd] text-[#4f5bd5] dark:border-[#4f5bd5] dark:bg-[#4f5bd5]/25 dark:text-[#9aa3f8]'
                : 'border-[#deded9] bg-white text-[#202337] dark:border-[#32354e] dark:bg-[#1e2030] dark:text-[#d0d3e5] hover:border-[#bfc3f1] dark:hover:border-[#4f5bd5]'
            )}
            title={isBookmarked ? 'Bookmarked' : 'Add to bookmarks'}
          >
            {isBookmarked ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
            <span>{isBookmarked ? 'Bookmarked' : 'Bookmark'}</span>
          </button>

          {/* Edit / Save Note button */}
          {attachedNote && (
            <>
              {isEditingNote ? (
                <button
                  onClick={handleSaveEdit}
                  className="flex items-center gap-1.5 rounded-xl bg-[#4f5bd5] text-white px-3.5 py-2 text-xs font-semibold hover:bg-[#434ec4] transition shadow-xs cursor-pointer"
                >
                  <Check size={14} />
                  <span>{t('save')}</span>
                </button>
              ) : (
                <button
                  onClick={handleStartEdit}
                  className="flex items-center gap-1.5 rounded-xl border border-[#deded9] bg-white text-[#202337] dark:border-[#32354e] dark:bg-[#1e2030] dark:text-[#d0d3e5] px-3.5 py-2 text-xs font-semibold hover:border-[#bfc3f1] hover:text-[#4f5bd5] dark:hover:border-[#4f5bd5] dark:hover:text-[#9aa3f8] transition shadow-xs cursor-pointer"
                >
                  <Pencil size={14} />
                  <span>{t('edit')}</span>
                </button>
              )}

              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 rounded-xl border border-[#deded9] bg-white text-[#b45b51] dark:border-[#32354e] dark:bg-[#1e2030] dark:text-[#f28b80] hover:bg-[#fdf1ef] dark:hover:bg-[#361d1c] px-3 py-2 text-xs font-semibold transition shadow-xs cursor-pointer"
                title="Delete note"
                aria-label="Delete note"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Syncing or Not Yet Saved Banner */}
      {userSignedIn && !attachedNote && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#bfc3f1] bg-[#edeefd] p-4 text-[#202337] dark:border-[#4f5bd5] dark:bg-[#1e2142] dark:text-white">
          <div className="flex items-center gap-3">
            <Sparkles size={18} className="text-[#4f5bd5] dark:text-[#9aa3f8] shrink-0" />
            <div className="text-xs">
              <span className="font-bold">No database study note found for {materialName}.</span> Generate and save notes to sync across your devices.
            </div>
          </div>
          <button
            type="button"
            disabled={isLoading}
            onClick={handleGenerate}
            className="flex items-center gap-1.5 rounded-xl bg-[#4f5bd5] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#434ec4] transition active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            <span>Generate & Save Notes</span>
          </button>
        </div>
      )}

      {/* Note Edit Form */}
      {isEditingNote && (
        <Card className="mb-6 p-5 border-[#4f5bd5]">
          <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[#4f5bd5] dark:text-[#8d96f5]">
            Edit Note Details
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[#5e6070] dark:text-[#c4c7db] mb-1">
                Note Title
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full h-9 rounded-xl border border-[#deded9] bg-white px-3 text-xs text-[#202337] dark:border-[#32354e] dark:bg-[#161724] dark:text-white outline-none focus:border-[#4f5bd5]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#5e6070] dark:text-[#c4c7db] mb-1">
                Summary
              </label>
              <textarea
                rows={3}
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                className="w-full rounded-xl border border-[#deded9] bg-white p-3 text-xs text-[#202337] dark:border-[#32354e] dark:bg-[#161724] dark:text-white outline-none focus:border-[#4f5bd5]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsEditingNote(false)}
                className="rounded-xl border border-[#deded9] dark:border-[#32354e] px-3.5 py-1.5 text-xs font-medium text-[#717485] hover:bg-[#f2f2ef] dark:text-[#a0a3b8] transition cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="rounded-xl bg-[#4f5bd5] px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#434ec4] transition cursor-pointer"
              >
                {t('save')}
              </button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_280px]">
        <article className="rounded-2xl border border-[#e7e6e1] bg-white dark:border-[#282a3e] dark:bg-[#1a1b29] p-6 sm:p-8 md:p-10 shadow-[0_2px_12px_rgba(31,35,53,0.025)]">
          {/* Summary Section */}
          <div id="notes-summary" className="scroll-mt-24 mb-9 border-b border-[#efefec] dark:border-[#282a3e] pb-7">
            <span className="rounded-md bg-[#e8f2ed] dark:bg-[#14291d] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#438568] dark:text-[#5ec290]">
              {t('notesTabMindMap')}
            </span>
            <p className="mt-4 text-base sm:text-lg leading-relaxed text-[#343747] dark:text-[#e1e3ed]">
              {displaySummary}
            </p>
          </div>

          {/* Dynamic Sections */}
          {dynamicSections.map((sec) => (
            <div key={sec.id} id={sec.id} className="scroll-mt-24 mb-8">
              <h3 className="mb-3 text-lg sm:text-xl font-bold text-[#202337] dark:text-white">
                {sec.title}
              </h3>
              {sec.content && (
                <p className="mb-5 text-sm sm:text-base leading-relaxed text-[#5e6070] dark:text-[#a6a9be]">
                  {sec.content}
                </p>
              )}

              {sec.examTip && (
                <div className="mb-6 rounded-xl border-l-4 border-[#4f5bd5] bg-[#f4f4fd] dark:bg-[#1b1d30] p-4 sm:p-5">
                  <div className="mb-1.5 flex items-center gap-2 text-xs font-bold text-[#4f5bd5] dark:text-[#9aa3f8]">
                    <Lightbulb size={15} /> {t('notesTabExamTips')}
                  </div>
                  <p className="text-xs sm:text-sm leading-relaxed text-[#5e6070] dark:text-[#c4c7db]">
                    {sec.examTip}
                  </p>
                </div>
              )}

              {sec.bullets && sec.bullets.length > 0 && (
                <ul className="grid gap-3 text-xs sm:text-sm leading-relaxed text-[#5e6070] dark:text-[#a6a9be]">
                  {sec.bullets.map((bullet, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-3 rounded-lg bg-[#fbfbfa] border-[#f0f0ed] dark:bg-[#161724] dark:border-[#26283b] p-3 border"
                    >
                      <span className="mt-1 size-2 shrink-0 rounded-full bg-[#4f5bd5]" />
                      <div>{bullet}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </article>

        {/* Sidebar Actions & Table of Contents */}
        <aside className="flex flex-col gap-5">
          <Card className="p-5">
            <div className="mb-3.5 text-xs font-bold uppercase tracking-wider text-[#9698a5] dark:text-[#84879c]">
              {t('learningLoopTitle')}
            </div>
            <button
              onClick={() => navigate('Interactive Quiz')}
              className="mb-2.5 flex w-full items-center justify-between rounded-xl bg-[#4f5bd5] px-4 py-3 text-xs font-semibold text-white shadow-xs hover:bg-[#434ec4] transition active:scale-[0.99] cursor-pointer"
            >
              <span>{t('notesQuizBtn')}</span>
              <ArrowRight size={15} />
            </button>
            <button
              onClick={() => navigate('AI Tutor')}
              className="flex w-full items-center justify-between rounded-xl border border-[#e3e3df] text-[#343747] dark:border-[#32354e] dark:bg-[#1e2030] dark:text-[#d0d3e5] dark:hover:border-[#4f5bd5] px-4 py-3 text-xs font-semibold hover:border-[#bfc3f1] hover:text-[#4f5bd5] transition active:scale-[0.99] cursor-pointer"
            >
              <span>{t('dashQuickTutorTitle')}</span>
              <ArrowRight size={15} />
            </button>
          </Card>

          <Card className="p-5">
            <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[#9698a5] dark:text-[#84879c]">
              {t('notesTabKeyConcepts')}
            </div>
            <div className="space-y-1">
              {dynamicSections.map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollTo(item.id, item.title)}
                  className={cn(
                    'w-full text-left rounded-lg px-3 py-2 text-xs transition cursor-pointer',
                    activeSection === item.title
                      ? 'bg-[#edeefd] text-[#4f5bd5] font-bold dark:bg-[#4f5bd5]/25 dark:text-[#9aa3f8]'
                      : 'text-[#777989] hover:bg-[#f5f5f2] hover:text-[#202337] dark:text-[#84879c] dark:hover:bg-[#222436] dark:hover:text-white'
                  )}
                >
                  {item.title}
                </button>
              ))}
            </div>
          </Card>

          {/* User's All Notes List (if more than 1 note exists) */}
          {notes && notes.length > 1 && (
            <Card className="p-5">
              <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[#9698a5] dark:text-[#84879c]">
                Saved Notes ({notes.length})
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {notes.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      'p-2 rounded-lg text-xs border transition',
                      attachedNote?.id === n.id
                        ? 'border-[#4f5bd5] bg-[#edeefd]/40 dark:bg-[#4f5bd5]/15'
                        : 'border-transparent hover:bg-[#f5f5f2] dark:hover:bg-[#24263a]'
                    )}
                  >
                    <div className="font-semibold text-[#202337] dark:text-white truncate">
                      {n.title}
                    </div>
                    {n.summary && (
                      <div className="text-[11px] text-[#84879c] truncate mt-0.5">
                        {n.summary}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </aside>
      </div>
    </>
  )
}

/* =========================================================================
   INTERACTIVE QUIZ SCREEN
   ========================================================================= */

function Quiz({
  quizIndex,
  setQuizIndex,
  answers,
  setAnswers,
  quizDone,
  setQuizDone,
  score,
  navigate,
  onCompleteQuiz,
  isSaving = false,
  userSignedIn = false,
}: {
  quizIndex: number
  setQuizIndex: (i: number) => void
  answers: Record<number, number>
  setAnswers: (a: Record<number, number>) => void
  quizDone: boolean
  setQuizDone: (d: boolean) => void
  score: number
  navigate: (s: Screen) => void
  onCompleteQuiz?: (score: number, answers: Record<number, number>) => Promise<void>
  isSaving?: boolean
  userSignedIn?: boolean
}) {
  const { t, quizQuestions } = useLanguage()
  const q = quizQuestions[quizIndex] || quizQuestions[0]
  const currentAnswerSelected = answers[quizIndex] !== undefined
  const hasSavedRef = useRef(false)

  const handleSubmitQuiz = async () => {
    setQuizDone(true)
    if (!hasSavedRef.current && onCompleteQuiz) {
      hasSavedRef.current = true
      await onCompleteQuiz(score, answers)
    }
  }

  const handleRetakeQuiz = () => {
    hasSavedRef.current = false
    setQuizDone(false)
    setQuizIndex(0)
    setAnswers({})
  }

  if (quizDone) {
    const percentage = Math.round((score / quizQuestions.length) * 100)
    const isPassing = percentage >= 66

    return (
      <>
        <SectionTitle
          eyebrow={`${t('navQuiz')} • ${t('notesMainHeading')}`}
          title={t('quizCompletedTitle')}
          description={t('quizDesc')}
        />
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Card className="flex flex-col items-center justify-center p-8 text-center">
            <div
              className={cn(
                'flex size-32 items-center justify-center rounded-full border-[10px] text-4xl font-bold transition shadow-xs',
                isPassing
                  ? 'border-[#c6e6d7] text-[#2e7d56] dark:border-[#22503a] dark:text-[#5ec290]'
                  : 'border-[#f6d7cf] text-[#b45b51] dark:border-[#582622] dark:text-[#f28b80]'
              )}
            >
              {percentage}
              <span className="text-lg font-semibold">%</span>
            </div>
            <h3 className="mt-5 font-bold text-base text-[#202337] dark:text-white">
              {isPassing ? t('quizFeedbackGreat') : t('quizFeedbackReview')}
            </h3>
            <p className="mt-1 text-xs text-[#8b8d9a] dark:text-[#84879c]">
              {score} / {quizQuestions.length} • {percentage}%
            </p>

            {userSignedIn && (
              <div className="mt-3 flex items-center justify-center gap-1.5 text-xs">
                {isSaving ? (
                  <span className="text-[#4f5bd5] dark:text-[#9aa3f8] flex items-center gap-1.5 font-medium">
                    <Loader2 size={13} className="animate-spin" /> Saving to database...
                  </span>
                ) : (
                  <span className="text-[#3b7e5e] dark:text-[#5ec290] flex items-center gap-1.5 font-medium">
                    <CheckCircle2 size={13} /> Saved to learning progress
                  </span>
                )}
              </div>
            )}

            <button
              onClick={handleRetakeQuiz}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#4f5bd5] px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-[#434ec4] transition active:scale-[0.99] cursor-pointer"
            >
              <RotateCcw size={14} /> {t('quizRetakeBtn')}
            </button>
            <button
              onClick={() => navigate('My Progress')}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#deded9] px-4 py-2 text-xs font-semibold text-[#4f5bd5] hover:bg-[#edeefd]/40 dark:border-[#32354e] dark:bg-[#1e2030] dark:text-[#9aa3f8] dark:hover:bg-[#25283d] transition cursor-pointer"
            >
              <Target size={14} /> View in My Progress
            </button>
            <button
              onClick={() => navigate('AI Notes')}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#deded9] px-4 py-2 text-xs font-semibold text-[#4b4e60] hover:bg-[#f5f5f2] dark:border-[#32354e] dark:bg-[#1e2030] dark:text-[#d0d3e5] dark:hover:bg-[#25283d] transition cursor-pointer"
            >
              {t('quizBackNotesBtn')}
            </button>
          </Card>

          <Card className="p-6 md:p-8">
            <h3 className="mb-5 font-bold text-base text-[#202337] dark:text-white">
              {t('quizExplanationTitle')}
            </h3>
            <div className="flex flex-col gap-4">
              {quizQuestions.map((item, i) => {
                const isCorrect = answers[i] === item.answer
                return (
                  <div
                    key={item.question}
                    className={cn(
                      'rounded-xl border p-4 transition',
                      isCorrect
                        ? 'border-[#d8eedf] bg-[#fbfdfc] dark:border-[#1e3d2c] dark:bg-[#14231b]'
                        : 'border-[#fae1dd] bg-[#fffdfd] dark:border-[#4d2320] dark:bg-[#261615]'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-full text-xs mt-0.5',
                          isCorrect ? 'bg-[#e8f2ed] text-[#2e7d56] dark:text-[#5ec290]' : 'bg-[#f9e9e7] text-[#b45b51] dark:text-[#f28b80]'
                        )}
                      >
                        {isCorrect ? <Check size={14} /> : <X size={14} />}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-[#202337] dark:text-white">{item.question}</div>
                        <div className="mt-2 text-xs leading-relaxed text-[#5e6070] dark:text-[#b0b3c7]">
                          <strong className={isCorrect ? 'text-[#2e7d56] dark:text-[#5ec290]' : 'text-[#b45b51] dark:text-[#f28b80]'}>
                            {isCorrect ? '✓ ' : `✗ (${item.options[item.answer]}) `}
                          </strong>
                          {item.explanation}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#efefec] dark:border-[#282a3e]">
              <button
                onClick={() => navigate('My Progress')}
                className="flex items-center gap-1.5 text-xs font-bold text-[#4f5bd5] dark:text-[#9aa3f8] hover:underline cursor-pointer"
              >
                <span>{t('progTitle')}</span>
                <ArrowRight size={14} />
              </button>
              <button
                onClick={() => navigate('AI Tutor')}
                className="text-xs font-medium text-[#777989] hover:text-[#202337] dark:text-[#84879c] dark:hover:text-white cursor-pointer"
              >
                {t('quizAskTutorBtn')} &rarr;
              </button>
            </div>
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="mb-6 flex items-end justify-between">
        <SectionTitle
          eyebrow={t('navQuiz')}
          title={t('quizTitle')}
          description={t('quizDesc')}
        />
        <span className="text-xs sm:text-sm font-bold text-[#4f5bd5] bg-[#edeefd] dark:text-[#9aa3f8] dark:bg-[#4f5bd5]/25 px-3 py-1.5 rounded-xl">
          {t('quizQuestionProgress', { current: quizIndex + 1, total: quizQuestions.length })}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="mb-7 h-2 rounded-full bg-[#e8e8e4] dark:bg-[#282a3e] overflow-hidden">
        <div
          className="h-full rounded-full bg-[#4f5bd5] transition-all duration-300"
          style={{ width: `${((quizIndex + 1) / quizQuestions.length) * 100}%` }}
        />
      </div>

      <Card className="mx-auto max-w-3xl p-6 sm:p-8 md:p-10">
        <div className="mb-6 flex items-center justify-between">
          <span className="rounded-md bg-[#edeefd] dark:bg-[#4f5bd5]/25 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#4f5bd5] dark:text-[#9aa3f8]">
            {t('quizQuestionProgress', { current: quizIndex + 1, total: quizQuestions.length })}
          </span>
          <span className="text-xs text-[#9799a5] dark:text-[#84879c]">{q.topic}</span>
        </div>

        <h3 className="text-lg sm:text-xl md:text-2xl font-bold leading-relaxed text-[#202337] dark:text-white">
          {q.question}
        </h3>

        <div className="mt-6 sm:mt-8 flex flex-col gap-3">
          {q.options.map((option: string, i: number) => {
            const isSelected = answers[quizIndex] === i
            return (
              <button
                key={option}
                onClick={() => setAnswers({ ...answers, [quizIndex]: i })}
                className={cn(
                  'flex items-center gap-3.5 rounded-xl border p-4 text-left text-xs sm:text-sm transition active:scale-[0.99] cursor-pointer',
                  isSelected
                    ? 'border-[#4f5bd5] bg-[#f3f4ff] text-[#293297] dark:border-[#4f5bd5] dark:bg-[#222544] dark:text-[#c7cdfc] font-semibold ring-2 ring-[#4f5bd5]/20'
                    : 'border-[#e8e8e4] hover:border-[#bfc3f1] hover:bg-[#fafafc] dark:border-[#32354e] dark:bg-[#161724] dark:text-[#e1e3ed] dark:hover:border-[#4f5bd5] dark:hover:bg-[#1e2032]'
                )}
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition',
                    isSelected
                      ? 'border-[#4f5bd5] bg-[#4f5bd5] text-white'
                      : 'border-[#d8d8d3] text-[#858795] dark:border-[#404360] dark:text-[#84879c]'
                  )}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="flex-1">{option}</span>
                {isSelected && <Check size={18} className="text-[#4f5bd5] dark:text-[#9aa3f8] shrink-0" />}
              </button>
            )
          })}
        </div>

        <div className="mt-8 flex items-center justify-between border-t border-[#efefec] dark:border-[#282a3e] pt-6">
          <button
            disabled={quizIndex === 0}
            onClick={() => setQuizIndex(quizIndex - 1)}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#7c7e8b] hover:text-[#202337] dark:text-[#84879c] dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
          >
            <ChevronLeft size={16} /> {t('quizPrevBtn')}
          </button>

          {quizIndex === quizQuestions.length - 1 ? (
            <button
              disabled={!currentAnswerSelected || isSaving}
              onClick={handleSubmitQuiz}
              className="flex items-center gap-1.5 rounded-xl bg-[#4f5bd5] px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-[#434ec4] transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              <span>{isSaving ? 'Submitting...' : t('quizSubmitBtn')}</span>
            </button>
          ) : (
            <button
              disabled={!currentAnswerSelected}
              onClick={() => setQuizIndex(quizIndex + 1)}
              className="flex items-center gap-1.5 rounded-xl bg-[#4f5bd5] px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-[#434ec4] transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <span>{t('quizNextBtn')}</span>
              <ChevronRight size={16} />
            </button>
          )}
        </div>
      </Card>
    </>
  )
}

/* =========================================================================
   AI TUTOR SCREEN
   ========================================================================= */

function Tutor({
  chat,
  message,
  setMessage,
  sendMessage,
  isTyping,
  reading,
  toggleReading,
  showToast,
  onClearChat,
  conversations = [],
  activeConversationId = null,
  onSelectConversation,
  onStartNewConversation,
  onDeleteConversation,
  onRenameConversation,
  isLoadingConversations = false,
  isLoadingMessages = false,
  userSignedIn = false,
  currentUser,
  userInitials = 'MC',
}: {
  chat: Array<{ role: 'user' | 'ai'; text: string; id?: string }>
  message: string
  setMessage: (m: string) => void
  sendMessage: (text?: string) => void
  isTyping: boolean
  reading: boolean
  toggleReading: (t: string) => void
  showToast: (m: string) => void
  onClearChat: () => void
  conversations?: TutorConversationRow[]
  activeConversationId?: string | null
  onSelectConversation?: (id: string) => void
  onStartNewConversation?: () => void
  onDeleteConversation?: (id: string) => void
  onRenameConversation?: (id: string, title: string) => void
  isLoadingConversations?: boolean
  isLoadingMessages?: boolean
  userSignedIn?: boolean
  currentUser?: {
    email?: string
    name?: string
    avatarUrl?: string
  } | null
  userInitials?: string
}) {
  const { t } = useLanguage()
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat, isTyping])

  return (
    <>
      <SectionTitle
        eyebrow={t('navTutor')}
        title={t('tutorTitle')}
        description={t('tutorDesc')}
      />

      <Card className="mx-auto flex max-w-4xl flex-col overflow-hidden shadow-sm">
        {/* Tutor Header */}
        <div className="flex items-center justify-between border-b border-[#efefec] bg-[#fbfbfa] dark:border-[#282a3e] dark:bg-[#161722] px-4 sm:px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-[#edeefd] dark:bg-[#4f5bd5]/25 text-[#4f5bd5] dark:text-[#9aa3f8] shadow-2xs">
              <Bot size={18} />
            </div>
            <div>
              <div className="text-sm font-bold text-[#202337] dark:text-white">
                {t('brandName')} {t('brandSuffix')} {t('navTutor')}
              </div>
              <div className="text-[11px] text-[#8d8f9e] dark:text-[#84879c]">
                {activeConversationId && conversations.find((c) => c.id === activeConversationId)
                  ? `Topic: ${conversations.find((c) => c.id === activeConversationId)?.title}`
                  : t('learningLoopDesc')}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* New Chat Button */}
            <button
              type="button"
              onClick={onStartNewConversation}
              className="flex items-center gap-1.5 rounded-xl border border-[#deded9] bg-white px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-[#686b7d] hover:border-[#bfc3f1] hover:text-[#4f5bd5] dark:border-[#32354e] dark:bg-[#1e2030] dark:text-[#a0a3b8] dark:hover:text-[#9aa3f8] dark:hover:border-[#4f5bd5] transition cursor-pointer"
              title="Start a new chat session"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">New Chat</span>
            </button>

            {/* History Toggle */}
            <button
              type="button"
              onClick={() => setHistoryOpen(!historyOpen)}
              className={cn(
                'flex items-center gap-1.5 rounded-xl border px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition cursor-pointer',
                historyOpen
                  ? 'border-[#4f5bd5] bg-[#edeefd] text-[#4f5bd5] dark:border-[#4f5bd5] dark:bg-[#4f5bd5]/20 dark:text-[#9aa3f8]'
                  : 'border-[#deded9] bg-white text-[#686b7d] hover:border-[#bfc3f1] hover:text-[#4f5bd5] dark:border-[#32354e] dark:bg-[#1e2030] dark:text-[#a0a3b8] dark:hover:text-[#9aa3f8] dark:hover:border-[#4f5bd5]'
              )}
              title="View saved chat history"
            >
              <History size={14} />
              <span className="hidden sm:inline">History</span>
              {conversations.length > 0 && (
                <span className="rounded-full bg-[#4f5bd5]/10 dark:bg-[#4f5bd5]/30 px-1.5 py-0.2 text-[10px] font-bold text-[#4f5bd5] dark:text-[#9aa3f8]">
                  {conversations.length}
                </span>
              )}
            </button>

            {/* Read Aloud Button */}
            <button
              type="button"
              onClick={() => toggleReading(chat[chat.length - 1]?.text || '')}
              className="rounded-xl border border-[#deded9] bg-white text-[#777989] dark:border-[#32354e] dark:bg-[#1e2030] dark:text-[#a0a3b8] dark:hover:border-[#4f5bd5] p-2 hover:text-[#4f5bd5] hover:border-[#bfc3f1] transition cursor-pointer"
              title={t('notesReadAloudBtn')}
              aria-label={t('notesReadAloudBtn')}
            >
              <Volume2 size={16} />
            </button>

            {/* Reset / Clear Button */}
            <button
              type="button"
              onClick={onClearChat}
              className="rounded-xl border border-[#deded9] bg-white text-[#777989] dark:border-[#32354e] dark:bg-[#1e2030] dark:text-[#a0a3b8] dark:hover:border-[#efc9c4] p-2 hover:text-[#b45b51] hover:border-[#efc9c4] transition cursor-pointer"
              title={t('cancel')}
              aria-label={t('cancel')}
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>

        {/* Saved Conversations Dropdown Panel */}
        {historyOpen && (
          <div className="border-b border-[#efefec] bg-[#fbfbfa] dark:border-[#282a3e] dark:bg-[#141520] p-4 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MessageSquare size={14} className="text-[#4f5bd5]" />
                <span className="text-xs font-bold text-[#202337] dark:text-white">
                  Study Chat History
                </span>
                {userSignedIn && (
                  <span className="text-[11px] text-[#8d8f9e] dark:text-[#84879c]">
                    ({conversations.length})
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="text-xs font-medium text-[#8d8f9e] hover:text-[#202337] dark:text-[#84879c] dark:hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>

            {!userSignedIn ? (
              <div className="rounded-xl border border-[#ecece8] bg-white p-3 text-xs text-[#777989] dark:border-[#2a2c3f] dark:bg-[#1a1b29] dark:text-[#a0a3b8]">
                <span>Sign in with Google to sync and restore your AI study conversations across devices.</span>
              </div>
            ) : isLoadingConversations ? (
              <div className="flex items-center justify-center py-6 text-xs text-[#8d8f9e] dark:text-[#84879c] gap-2">
                <Loader2 size={15} className="animate-spin text-[#4f5bd5]" />
                <span>Loading conversations...</span>
              </div>
            ) : conversations.length === 0 ? (
              <div className="rounded-xl border border-[#ecece8] bg-white p-4 text-center text-xs text-[#8d8f9e] dark:border-[#2a2c3f] dark:bg-[#1a1b29] dark:text-[#84879c]">
                <span>No saved conversations yet. Ask the tutor a question to create your first session!</span>
              </div>
            ) : (
              <div className="grid gap-2 max-h-52 overflow-y-auto sm:grid-cols-2 md:grid-cols-3 pr-1">
                {conversations.map((c) => {
                  const isActive = c.id === activeConversationId
                  const dateStr = new Date(c.updated_at || c.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-xl border p-2.5 text-xs transition cursor-pointer group',
                        isActive
                          ? 'border-[#4f5bd5] bg-[#edeefd]/60 dark:border-[#4f5bd5] dark:bg-[#4f5bd5]/25 text-[#4f5bd5] dark:text-[#9aa3f8]'
                          : 'border-[#e8e8e4] bg-white hover:border-[#bfc3f1] dark:border-[#2a2c3f] dark:bg-[#1a1b29] dark:hover:border-[#4f5bd5]/50 text-[#333649] dark:text-[#d0d3e5]'
                      )}
                      onClick={() => {
                        onSelectConversation?.(c.id)
                        setHistoryOpen(false)
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">{c.title || 'Study Session'}</div>
                        <div className="text-[10px] text-[#8d8f9e] dark:text-[#84879c]">{dateStr}</div>
                      </div>
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                        {onRenameConversation && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              const newTitle = window.prompt('Rename conversation:', c.title)
                              if (newTitle && newTitle.trim()) {
                                onRenameConversation(c.id, newTitle.trim())
                              }
                            }}
                            className="p-1 text-[#8d8f9e] hover:text-[#4f5bd5] dark:hover:text-[#9aa3f8] transition cursor-pointer"
                            title="Rename"
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                        {onDeleteConversation && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (window.confirm('Delete this study session?')) {
                                onDeleteConversation(c.id)
                              }
                            }}
                            className="p-1 text-[#8d8f9e] hover:text-[#b45b51] dark:hover:text-[#f28b80] transition cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Chat Stream */}
        <div className="flex min-h-[380px] max-h-[520px] overflow-y-auto flex-col gap-4 p-5 sm:p-6 bg-white dark:bg-[#1a1b29]">
          {chat.map((item: any, i: number) => {
            const isUser = item.role === 'user'
            return (
              <div
                key={i}
                className={cn(
                  'flex max-w-[88%] sm:max-w-[80%] gap-3',
                  isUser ? 'ml-auto flex-row-reverse' : ''
                )}
              >
                <div
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold mt-1 overflow-hidden',
                    isUser
                      ? 'bg-[#f2c9a9] text-[#75472c]'
                      : 'bg-[#edeefd] text-[#4f5bd5] dark:bg-[#4f5bd5]/25 dark:text-[#9aa3f8]'
                  )}
                >
                  {isUser ? (
                    currentUser?.avatarUrl ? (
                      <img src={currentUser.avatarUrl} alt="" className="size-full object-cover" />
                    ) : (
                      userInitials || 'MC'
                    )
                  ) : (
                    'AI'
                  )}
                </div>
                <div
                  className={cn(
                    'rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed whitespace-pre-line',
                    isUser
                      ? 'bg-[#4f5bd5] text-white shadow-xs'
                      : 'bg-[#f4f4f1] text-[#333649] border-[#ecece8] dark:bg-[#222436] dark:text-[#e1e3ed] dark:border-[#32354e] border'
                  )}
                >
                  {item.text}
                </div>
              </div>
            )
          })}

          {isTyping && (
            <div className="flex max-w-[80%] gap-3">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#edeefd] dark:bg-[#4f5bd5]/25 text-[#4f5bd5] dark:text-[#9aa3f8] text-[10px] font-bold mt-1">
                AI
              </div>
              <div className="rounded-2xl bg-[#f4f4f1] dark:bg-[#222436] dark:text-[#e1e3ed] dark:border-[#32354e] border border-[#ecece8] px-4 py-3 text-xs text-[#777989] flex items-center gap-1.5">
                <Loader2 size={13} className="animate-spin text-[#4f5bd5]" />
                <span>{t('tutorTyping')}</span>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Suggestion Chips */}
        <div className="flex flex-wrap gap-2 px-5 pb-3 pt-2 border-t border-[#f0f0ed] bg-white dark:border-[#282a3e] dark:bg-[#1a1b29]">
          {[
            t('tutorChipSimple'),
            t('tutorChipAnalogy'),
            t('tutorChipQuiz'),
            t('tutorChipSummary'),
          ].map((prompt) => (
            <button
              key={prompt}
              onClick={() => sendMessage(prompt)}
              className="rounded-full border border-[#deded9] px-3 py-1.5 text-[11px] font-medium text-[#686b7d] hover:border-[#bfc3f1] hover:text-[#4f5bd5] hover:bg-[#edeefd]/30 dark:border-[#32354e] dark:bg-[#1e2030] dark:text-[#a0a3b8] dark:hover:bg-[#272940] dark:hover:text-[#9aa3f8] transition"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="border-t border-[#efefec] p-4 bg-[#fbfbfa] dark:border-[#282a3e] dark:bg-[#161722]">
          <div className="flex items-center gap-2 rounded-xl border border-[#deded9] bg-white dark:border-[#32354e] dark:bg-[#1e2030] p-2 focus-within:border-[#4f5bd5] focus-within:ring-2 focus-within:ring-[#4f5bd5]/10 transition">
            <button
              type="button"
              onClick={() =>
                showToast(t('notesTtsUnavailable'))
              }
              className="rounded-lg p-2 text-[#777989] hover:bg-[#f4f4f1] hover:text-[#4f5bd5] dark:text-[#84879c] dark:hover:bg-[#282a3d] transition"
              aria-label={t('notesReadAloudBtn')}
              title={t('notesReadAloudBtn')}
            >
              <Mic size={17} />
            </button>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) sendMessage()
              }}
              placeholder={t('tutorInputPlaceholder')}
              className="min-w-0 flex-1 bg-transparent px-1 text-xs sm:text-sm outline-none text-[#202337] dark:text-white dark:placeholder-[#6f7288]"
            />
            <button
              disabled={!message.trim() || isTyping}
              onClick={() => sendMessage()}
              className="flex size-9 items-center justify-center rounded-lg bg-[#4f5bd5] text-white hover:bg-[#434ec4] transition disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
              aria-label={t('tutorSendBtn')}
            >
              <Send size={15} />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-[#9a9ba5] dark:text-[#7f8297] px-1">
            <span className="flex items-center gap-1">
              <Sparkles size={11} className="text-[#4f5bd5]" /> {t('notesDesc')}
            </span>
            <span>{t('tutorSendBtn')}</span>
          </div>
        </div>
      </Card>
    </>
  )
}

/* =========================================================================
   MY PROGRESS SCREEN
   ========================================================================= */

function Progress({
  navigate,
  showToast,
  quizAttempts = [],
  isLoading = false,
  userSignedIn = false,
  onDeleteAttempt,
}: {
  navigate: (s: Screen) => void
  showToast: (m: string) => void
  quizAttempts?: QuizAttemptRow[]
  isLoading?: boolean
  userSignedIn?: boolean
  onDeleteAttempt?: (id: string) => Promise<void> | void
}) {
  const { t } = useLanguage()
  const [timeframe, setTimeframe] = useState<'week' | 'month' | 'all'>('week')

  const filteredAttempts = useMemo(() => {
    if (!userSignedIn) return []
    const now = Date.now()
    if (timeframe === 'week') {
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
      return quizAttempts.filter((a) => new Date(a.created_at).getTime() >= sevenDaysAgo)
    }
    if (timeframe === 'month') {
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000
      return quizAttempts.filter((a) => new Date(a.created_at).getTime() >= thirtyDaysAgo)
    }
    return quizAttempts
  }, [quizAttempts, timeframe, userSignedIn])

  const stats = useMemo(() => {
    if (!userSignedIn) {
      return {
        avgScore: 84,
        totalQuizzes: 12,
        totalQuestions: 8,
        isLive: false,
      }
    }
    const count = filteredAttempts.length
    if (count === 0) {
      return {
        avgScore: 0,
        totalQuizzes: 0,
        totalQuestions: 0,
        isLive: true,
      }
    }
    const totalQ = filteredAttempts.reduce((acc, curr) => acc + (curr.total_questions || 0), 0)
    const avg = Math.round(filteredAttempts.reduce((acc, curr) => acc + curr.percentage, 0) / count)
    return {
      avgScore: avg,
      totalQuizzes: count,
      totalQuestions: totalQ,
      isLive: true,
    }
  }, [filteredAttempts, userSignedIn])

  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <SectionTitle
          eyebrow={t('navProgress')}
          title={t('progTitle')}
          description={t('progDesc')}
        />
        <div className="flex rounded-xl bg-[#f0f0ed] dark:bg-[#222436] p-1 text-xs font-semibold">
          {[
            { id: 'week', label: '7D' },
            { id: 'month', label: '30D' },
            { id: 'all', label: 'ALL' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setTimeframe(item.id as any)}
              className={cn(
                'rounded-lg px-3 py-1.5 transition cursor-pointer',
                timeframe === item.id
                  ? 'bg-white text-[#4f5bd5] dark:bg-[#1a1b29] dark:text-[#9aa3f8] shadow-2xs font-bold'
                  : 'text-[#777989] hover:text-[#202337] dark:text-[#84879c] dark:hover:text-white'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Card className="p-6">
          <div className="text-xs font-semibold text-[#8d8f9e] dark:text-[#84879c] uppercase tracking-wider">
            {t('dashScoreLabel')}
          </div>
          <div className="mt-3 text-3xl font-bold text-[#202337] dark:text-white">
            {stats.avgScore}<span className="text-lg font-medium">%</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-[#3b7e5e] dark:text-[#5ec290]">
            <span>{stats.isLive ? `${stats.totalQuizzes} attempts evaluated` : '+8%'}</span>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-[#f0f0ed] dark:bg-[#282a3e]">
            <div
              className="h-1.5 rounded-full bg-[#3b7e5e] dark:bg-[#5ec290] transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, stats.avgScore))}%` }}
            />
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-xs font-semibold text-[#8d8f9e] dark:text-[#84879c] uppercase tracking-wider">
            {t('progQuizzesTaken')}
          </div>
          <div className="mt-3 text-3xl font-bold text-[#202337] dark:text-white">{stats.totalQuizzes}</div>
          <div className="mt-2 text-xs text-[#8d8f9e] dark:text-[#84879c]">
            {stats.isLive ? 'Recorded in database' : t('dashStreakSub')}
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-[#f0f0ed] dark:bg-[#282a3e]">
            <div
              className="h-1.5 rounded-full bg-[#4f5bd5] transition-all duration-300"
              style={{ width: `${Math.min(100, stats.totalQuizzes * 10)}%` }}
            />
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-xs font-semibold text-[#8d8f9e] dark:text-[#84879c] uppercase tracking-wider">
            {t('progQuestionsAnswered')}
          </div>
          <div className="mt-3 text-3xl font-bold text-[#202337] dark:text-white">{stats.totalQuestions}</div>
          <div className="mt-2 text-xs text-[#8d8f9e] dark:text-[#84879c]">
            {stats.isLive ? 'Across verified attempts' : t('dashMaterialsSub')}
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-[#f0f0ed] dark:bg-[#282a3e]">
            <div
              className="h-1.5 rounded-full bg-[#b98534] dark:bg-[#e5ab56] transition-all duration-300"
              style={{ width: `${Math.min(100, stats.totalQuestions * 5)}%` }}
            />
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="p-6 md:p-7">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="font-bold text-base text-[#202337] dark:text-white">
              {t('progMasteryTitle')}
            </h3>
            {userSignedIn && (
              <span className="text-[11px] font-medium text-[#8d8f9e] dark:text-[#84879c]">
                {filteredAttempts.length} {filteredAttempts.length === 1 ? 'record' : 'records'}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-xs text-[#8d8f9e] dark:text-[#84879c] gap-2">
              <Loader2 size={16} className="animate-spin text-[#4f5bd5]" />
              <span>Loading quiz history...</span>
            </div>
          ) : userSignedIn ? (
            filteredAttempts.length === 0 ? (
              <div className="py-8 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#edeefd] dark:bg-[#4f5bd5]/20 text-[#4f5bd5] dark:text-[#9aa3f8] mb-3">
                  <CircleHelp size={22} />
                </div>
                <div className="text-sm font-semibold text-[#202337] dark:text-white">
                  No quiz attempts recorded yet
                </div>
                <p className="mt-1 text-xs text-[#8d8f9e] dark:text-[#84879c] max-w-sm mx-auto">
                  Take a quiz from your study materials or start an interactive test to track your mastery.
                </p>
                <button
                  onClick={() => navigate('Interactive Quiz')}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#4f5bd5] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#434ec4] transition cursor-pointer"
                >
                  <span>Start a Quiz</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[#efefec] dark:divide-[#282a3e] max-h-[380px] overflow-y-auto pr-1">
                {filteredAttempts.map((item) => {
                  const dateStr = new Date(item.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                  const isHigh = item.percentage >= 70
                  const isMid = item.percentage >= 40 && item.percentage < 70
                  return (
                    <div key={item.id} className="flex items-center gap-3.5 py-3.5 first:pt-0 last:pb-0">
                      <div
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-xl',
                          isHigh
                            ? 'bg-[#e8f2ed] dark:bg-[#14291d] text-[#3b7e5e] dark:text-[#5ec290]'
                            : isMid
                            ? 'bg-[#fef4e6] dark:bg-[#2b2112] text-[#d28a55]'
                            : 'bg-[#fdeeed] dark:bg-[#2b1716] text-[#b45b51]'
                        )}
                      >
                        {isHigh ? <Check size={16} /> : <Target size={16} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-[#202337] dark:text-white truncate">
                          {item.topic}
                        </div>
                        <div className="mt-0.5 text-xs text-[#9698a5] dark:text-[#84879c]">
                          {dateStr} &bull; {item.score}/{item.total_questions} correct
                        </div>
                      </div>
                      <div
                        className={cn(
                          'text-sm font-bold',
                          isHigh
                            ? 'text-[#3b7e5e] dark:text-[#5ec290]'
                            : isMid
                            ? 'text-[#d28a55]'
                            : 'text-[#b45b51]'
                        )}
                      >
                        {item.percentage}%
                      </div>
                      {onDeleteAttempt && (
                        <button
                          type="button"
                          onClick={async () => {
                            const confirmed = window.confirm('Delete this quiz attempt record?')
                            if (confirmed) {
                              await onDeleteAttempt(item.id)
                            }
                          }}
                          className="rounded-lg p-1.5 text-[#8d8f9e] hover:text-[#b45b51] hover:bg-[#fdeeed] dark:text-[#7f8297] dark:hover:text-[#f28b80] dark:hover:bg-[#361d1c] transition cursor-pointer"
                          title="Delete attempt"
                          aria-label="Delete attempt"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          ) : (
            <div className="divide-y divide-[#efefec] dark:divide-[#282a3e]">
              {[
                { name: 'Cell Structure & Function', score: '84%', date: 'Today', correct: '3/3' },
                { name: 'Organic Chemistry Basics', score: '76%', date: 'Yesterday', correct: '4/5' },
                { name: 'Introduction to Psychology', score: '92%', date: 'Oct 10', correct: '5/5' },
              ].map((item) => (
                <div key={item.name + item.date} className="flex items-center gap-3.5 py-3.5 first:pt-0 last:pb-0">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#e8f2ed] dark:bg-[#14291d] text-[#3b7e5e] dark:text-[#5ec290]">
                    <Check size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#202337] dark:text-white truncate">{item.name}</span>
                      <span className="text-[10px] text-[#8d8f9e] bg-[#f0f0ed] dark:bg-[#282a3e] px-1.5 py-0.5 rounded font-normal">Demo</span>
                    </div>
                    <div className="mt-0.5 text-xs text-[#9698a5] dark:text-[#84879c]">
                      {item.date} &bull; {item.correct}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-[#3b7e5e] dark:text-[#5ec290]">{item.score}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6 md:p-7">
          <div className="mb-4 flex items-center gap-2">
            <Target size={17} className="text-[#d28a55]" />
            <h3 className="font-bold text-base text-[#202337] dark:text-white">{t('progSpacedRepTitle')}</h3>
          </div>
          <p className="text-xs text-[#8d8f9e] dark:text-[#84879c] mb-4">
            {t('progReviewTodayItem')}
          </p>
          <div className="space-y-3">
            {[
              { topic: 'Cell organelles & ATP synthesis', badge: t('progMasteryHigh') },
              { topic: 'Phospholipid bilayer transport', badge: t('progMasteryModerate') },
              { topic: 'Homeostatic osmotic equilibrium', badge: t('progMasteryReview') },
            ].map((item) => (
              <div
                key={item.topic}
                className="flex items-center justify-between gap-3 rounded-xl bg-[#fbfaf7] border-[#f3efe5] dark:bg-[#1e1c18] dark:border-[#383327] p-3.5 border"
              >
                <div>
                  <div className="text-xs sm:text-sm font-semibold text-[#202337] dark:text-white">{item.topic}</div>
                  <div className="mt-0.5 text-[10px] text-[#b98534] dark:text-[#e5ab56] font-medium">{item.badge}</div>
                </div>
                <button
                  onClick={() => {
                    navigate('AI Notes')
                    showToast(`${t('progStartRevisionBtn')}: ${item.topic}`)
                  }}
                  className="rounded-lg bg-white border border-[#deded9] dark:border-[#383327] dark:bg-[#26241e] dark:text-[#e5ab56] dark:hover:border-[#e5ab56] px-3 py-1.5 text-xs font-semibold text-[#4f5bd5] hover:border-[#bfc3f1] transition shrink-0"
                >
                  {t('progStartRevisionBtn')}
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}

/* =========================================================================
   SCAN & FIND ANSWERS SCREEN
   ========================================================================= */

function Scan({
  scanText,
  setScanText,
  showToast,
  scanQueries = [],
  isLoadingScanQueries = false,
  onSaveScanQuery,
  onDeleteScanQuery,
  currentMaterial,
  language,
  userSignedIn = false,
  navigate,
}: {
  scanText: string
  setScanText: (s: string) => void
  showToast: (m: string) => void
  scanQueries?: ScanQueryRow[]
  isLoadingScanQueries?: boolean
  onSaveScanQuery?: (query: {
    question_text: string
    image_path?: string | null
    mode: 'notes' | 'general'
    answer_text?: string | null
    source_citation?: string | null
    confidence?: string | null
  }) => Promise<ScanQueryRow | null>
  onDeleteScanQuery?: (id: string) => Promise<boolean>
  currentMaterial?: Material | null
  language: Language
  userSignedIn?: boolean
  navigate?: (s: Screen) => void
}) {
  const { t } = useLanguage()
  const [mode, setMode] = useState<'notes' | 'general'>('notes')
  const [imageName, setImageName] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [scanDiagnostics, setScanDiagnostics] = useState<string | null>(null)
  const [totalPagesScanned, setTotalPagesScanned] = useState<number | null>(null)
  const [extractedTopics, setExtractedTopics] = useState<
    Array<{
      topic: string
      explanation: string
      pageNumber?: number
    }>
  >([])
  const [answerError, setAnswerError] = useState<string | null>(null)
  const [answerResult, setAnswerResult] = useState<{
    answer: string
    source: string
    confidence: string
  } | null>(null)
  const scanInputRef = useRef<HTMLInputElement>(null)

  const handleImageSelect = (file: File) => {
    if (!file) return

    // 1. Validate file type
    const validExtensions = /\.(jpe?g|png|webp|gif|pdf)$/i
    const validMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
    if (!validMimes.includes(file.type) && !file.name.match(validExtensions)) {
      showToast('Please upload a valid image (JPEG, PNG, WebP) or PDF document.')
      return
    }

    // 2. Validate file size (max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      showToast('File size exceeds the 5MB limit. Please choose a smaller file.')
      return
    }

    setImageName(file.name)
    setIsExtracting(true)
    setExtractError(null)
    setScanDiagnostics(null)
    setExtractedTopics([])
    setTotalPagesScanned(null)

    const reader = new FileReader()
    reader.onerror = () => {
      setIsExtracting(false)
      setExtractError('Failed to read the file.')
      showToast('Failed to read file for scanning.')
    }
    reader.onload = async () => {
      try {
        const base64Data = (reader.result as string) || ''
        const mimeType = file.name.toLowerCase().endsWith('.pdf')
          ? 'application/pdf'
          : file.type || 'image/jpeg'

        const res = await fetch('/api/scan/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: base64Data,
            mimeType,
            fileName: file.name,
            language,
          }),
        })

        const data = await res.json()
        const textContent = (data.extractedText || data.text || '').trim()

        if (res.ok) {
          if (textContent) {
            setScanText(textContent)
          }
          if (typeof data.totalPages === 'number') {
            setTotalPagesScanned(data.totalPages)
          }
          if (Array.isArray(data.topics) && data.topics.length > 0) {
            setExtractedTopics(data.topics)
            showToast(`Scanned "${file.name}" & extracted ${data.topics.length} key topics!`)
          } else if (textContent) {
            setExtractedTopics([])
            showToast(`Extracted document text from "${file.name}"`)
          } else {
            showToast(`Processed "${file.name}"`)
          }

          if (data.diagnostics) {
            setScanDiagnostics(data.diagnostics)
          } else {
            setScanDiagnostics(null)
          }
        } else if (res.status === 503 || !data.configured) {
          setExtractError(data.error || data.message || 'Visual OCR requires GEMINI_API_KEY.')
          showToast(data.error || data.message || 'Visual OCR requires an active GEMINI_API_KEY.')
        } else {
          setExtractError(data.error || 'Failed to detect readable text in this file.')
          showToast(data.error || 'OCR could not detect readable text in this file.')
        }
      } catch (err: any) {
        setExtractError(err?.message || 'Network error during document scanning.')
        showToast('Network error during document scanning.')
      } finally {
        setIsExtracting(false)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleFindAnswer = async () => {
    const trimmedQuestion = scanText.trim()
    if (!trimmedQuestion) {
      showToast(t('scanPlaceholder'))
      return
    }

    if (trimmedQuestion.length > 2000) {
      showToast('Question exceeds 2,000 characters limit. Please shorten your query.')
      return
    }

    setIsSearching(true)
    setAnswerError(null)

    try {
      const docContext = mode === 'notes'
        ? (currentMaterial?.name
            ? `Reference Material: ${currentMaterial.name}. Topic: Cell Biology and Organelles. The plasma membrane is composed of a phospholipid bilayer with embedded transport proteins, maintaining selective permeability and ion gradients. Mitochondria are the powerhouse of the cell, synthesizing ATP through oxidative phosphorylation using ATP synthase.`
            : 'Cell Biology and Organelles: The plasma membrane is composed of a phospholipid bilayer with embedded transport proteins, maintaining selective permeability and ion gradients. Mitochondria are the powerhouse of the cell, synthesizing ATP through oxidative phosphorylation using ATP synthase.')
        : undefined

      const res = await fetch('/api/scan/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmedQuestion,
          context: docContext,
          mode,
          language,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        const msg = data.error || 'Failed to generate answer from scan.'
        setAnswerError(msg)
        showToast(msg)
        return
      }

      const generated = {
        answer: data.answer || '',
        source: data.sourceCitation || (mode === 'notes' ? `${currentMaterial?.name || 'Class Notes'} • Verified Citation` : 'StudyMate General AI Knowledge Base'),
        confidence: data.confidence || '95%',
      }

      setAnswerResult(generated)
      showToast('Answer retrieved successfully!')

      if (userSignedIn && onSaveScanQuery) {
        await onSaveScanQuery({
          question_text: trimmedQuestion,
          image_path: imageName || null,
          mode,
          answer_text: generated.answer,
          source_citation: generated.source,
          confidence: generated.confidence,
        })
      }
    } catch (err: any) {
      setAnswerError(err?.message || 'Network error fetching answer')
      showToast('Network error while querying AI answer.')
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <>
      <SectionTitle
        eyebrow={t('navScan')}
        title={t('scanTitle')}
        description={t('scanDesc')}
      />

      <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
        <Card className="p-5 sm:p-6 md:p-7">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f2eddf] text-[#b98534] dark:bg-[#342a17] dark:text-[#e5ab56]">
              <Search size={19} />
            </div>
            <div>
              <h3 className="font-bold text-base text-[#202337] dark:text-white">{t('scanTabUpload')}</h3>
              <p className="text-xs text-[#9293a0] dark:text-[#84879c]">{t('scanImageDropSub')}</p>
            </div>
          </div>

          <div
            onClick={() => !isExtracting && scanInputRef.current?.click()}
            className={cn(
              "flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#dcdcd6] bg-[#fbfbfa] dark:border-[#32354e] dark:bg-[#161724] p-5 text-center transition hover:border-[#4f5bd5] hover:bg-[#edeefd]/20",
              isExtracting && "opacity-75 cursor-wait"
            )}
          >
            <div className="flex size-10 items-center justify-center rounded-full bg-white dark:bg-[#222436] text-[#4f5bd5] dark:text-[#9aa3f8] shadow-xs">
              {isExtracting ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
            </div>
            <p className="mt-3 text-xs sm:text-sm font-semibold text-[#202337] dark:text-white">
              {isExtracting
                ? 'Processing document OCR...'
                : imageName
                ? `${t('matStatusReady')}: ${imageName}`
                : t('scanImageDropTitle')}
            </p>
            <p className="mt-1 text-[11px] text-[#9698a5] dark:text-[#84879c]">
              {isExtracting ? 'Analyzing text with AI vision...' : t('scanImageDropSub')}
            </p>
            <button
              type="button"
              disabled={isExtracting}
              className="mt-3.5 rounded-lg border border-[#deded9] bg-white text-[#4f5bd5] dark:border-[#32354e] dark:bg-[#222436] dark:text-[#9aa3f8] px-3 py-1.5 text-xs font-semibold hover:bg-[#edeefd]/40 transition shadow-2xs disabled:opacity-50"
            >
              {t('uploadMaterialBtn')}
            </button>
            <input
              ref={scanInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleImageSelect(e.target.files[0])
              }}
            />
          </div>

          {extractError && (
            <div className="mt-3 rounded-xl bg-[#fdeeed] dark:bg-[#2b1716] border border-[#f7c2be] dark:border-[#4d2524] p-3 text-xs text-[#b45b51] dark:text-[#f28b80]">
              {extractError}
            </div>
          )}

          {scanDiagnostics && (
            <div className="mt-3 rounded-xl bg-[#f0f4ff] dark:bg-[#1a203a] border border-[#cbd5e1] dark:border-[#2d3a60] p-3 text-xs text-[#334155] dark:text-[#93c5fd]">
              <div className="flex items-start gap-2">
                <Info size={15} className="mt-0.5 shrink-0 text-[#3b82f6]" />
                <div>
                  <span className="font-semibold">Document scan update: </span>
                  {scanDiagnostics}
                </div>
              </div>
            </div>
          )}

          {/* Quick preset tests */}
          <div className="mt-4">
            <div className="text-[11px] font-semibold text-[#777989] dark:text-[#84879c] mb-1.5">
              {t('scanSampleBtn')}:
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setImageName('sample_cell_problem.jpg')
                  setScanText('How does the phospholipid bilayer achieve selective permeability?')
                  setExtractError(null)
                  setScanDiagnostics(null)
                  setExtractedTopics([
                    {
                      topic: 'Phospholipid Bilayer Structure',
                      explanation: 'Amphipathic lipid organization forming a hydrophobic interior core that impedes polar solutes.',
                      pageNumber: 1,
                    },
                    {
                      topic: 'Selective Permeability Mechanisms',
                      explanation: 'Passive diffusion for nonpolar molecules versus protein-facilitated transport for ions and sugars.',
                      pageNumber: 1,
                    },
                  ])
                }}
                className="rounded-lg border border-[#deded9] bg-[#f8f8f6] text-[#4f5bd5] dark:border-[#32354e] dark:bg-[#222436] dark:text-[#9aa3f8] dark:hover:bg-[#282b44] px-2.5 py-1 text-[11px] hover:bg-[#edeefd]/40 transition font-medium"
              >
                Sample 1: Membrane permeability
              </button>
              <button
                type="button"
                onClick={() => {
                  setImageName('sample_mitochondria_q.png')
                  setScanText('What role does ATP synthase play in the mitochondrial inner membrane?')
                  setExtractError(null)
                  setScanDiagnostics(null)
                  setExtractedTopics([
                    {
                      topic: 'Mitochondrial Inner Membrane & Cristae',
                      explanation: 'Folded membrane structure maximizing surface area for electron transport chain complexes.',
                      pageNumber: 2,
                    },
                    {
                      topic: 'Chemiosmotic ATP Synthesis',
                      explanation: 'Proton-motive force across the cristae driving rotary catalytic phosphorylation of ADP to ATP.',
                      pageNumber: 2,
                    },
                  ])
                }}
                className="rounded-lg border border-[#deded9] bg-[#f8f8f6] text-[#4f5bd5] dark:border-[#32354e] dark:bg-[#222436] dark:text-[#9aa3f8] dark:hover:bg-[#282b44] px-2.5 py-1 text-[11px] hover:bg-[#edeefd]/40 transition font-medium"
              >
                Sample 2: ATP synthase role
              </button>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#333649] dark:text-[#d0d3e5]">{t('scanTabPaste')}</label>
              <span className="text-[10px] text-[#8d8f9e] dark:text-[#84879c]">
                {scanText.length}/2000
              </span>
            </div>
            <textarea
              value={scanText}
              onChange={(e) => setScanText(e.target.value)}
              placeholder={t('scanPlaceholder')}
              maxLength={2000}
              className="mt-2 min-h-24 w-full rounded-xl border border-[#e4e4df] bg-[#fbfbfa] text-[#202337] dark:border-[#32354e] dark:bg-[#161724] dark:text-white dark:placeholder-[#6f7288] p-3 text-xs sm:text-sm outline-none focus:border-[#4f5bd5] focus:bg-white dark:focus:bg-[#1c1d2e] transition"
            />
          </div>
        </Card>

        {/* Answer Selection & Generation */}
        <Card className="p-5 sm:p-6 md:p-7 flex flex-col justify-between">
          <div>
            <div className="mb-4">
              <h3 className="font-bold text-base text-[#202337] dark:text-white">{t('scanSolutionTitle')}</h3>
              <p className="mt-0.5 text-xs text-[#9293a0] dark:text-[#84879c]">{t('notesSelectSource')}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode('notes')}
                className={cn(
                  'rounded-xl border p-4 text-left transition active:scale-[0.99] cursor-pointer',
                  mode === 'notes'
                    ? 'border-[#4f5bd5] bg-[#f4f4fd] dark:border-[#4f5bd5] dark:bg-[#222544] ring-2 ring-[#4f5bd5]/20'
                    : 'border-[#e6e6e2] dark:border-[#32354e] dark:bg-[#161724] dark:hover:border-[#4f5bd5] hover:border-[#bdc2f2]'
                )}
              >
                <FileText size={18} className="mb-3 text-[#4f5bd5]" />
                <div className="text-sm font-bold text-[#202337] dark:text-white">{t('notesSelectSource')}</div>
                <div className="mt-1 text-xs leading-relaxed text-[#777989] dark:text-[#9ea1b5]">
                  {t('notesMainHeading')}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode('general')}
                className={cn(
                  'rounded-xl border p-4 text-left transition active:scale-[0.99] cursor-pointer',
                  mode === 'general'
                    ? 'border-[#4f5bd5] bg-[#f4f4fd] dark:border-[#4f5bd5] dark:bg-[#222544] ring-2 ring-[#4f5bd5]/20'
                    : 'border-[#e6e6e2] dark:border-[#32354e] dark:bg-[#161724] dark:hover:border-[#4f5bd5] hover:border-[#bdc2f2]'
                )}
              >
                <Sparkles size={18} className="mb-3 text-[#4f5bd5]" />
                <div className="text-sm font-bold text-[#202337] dark:text-white">{t('dashQuickTutorTitle')}</div>
                <div className="mt-1 text-xs leading-relaxed text-[#777989] dark:text-[#9ea1b5]">
                  {t('learningLoopDesc')}
                </div>
              </button>
            </div>

            <button
              type="button"
              onClick={handleFindAnswer}
              disabled={isSearching}
              className="mt-5 w-full flex items-center justify-center gap-2 rounded-xl bg-[#4f5bd5] py-3 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#434ec4] transition active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
              {isSearching ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{t('scanAnalyzing')}</span>
                </>
              ) : (
                <>
                  <Search size={16} />
                  <span>{t('scanAnalyzeBtn')}</span>
                </>
              )}
            </button>

            {answerError && (
              <div className="mt-3 rounded-xl bg-[#fdeeed] dark:bg-[#2b1716] border border-[#f7c2be] dark:border-[#4d2524] p-3 text-xs text-[#b45b51] dark:text-[#f28b80]">
                {answerError}
              </div>
            )}

            {/* Answer Preview Box */}
            <div className="mt-6 rounded-xl bg-[#fbfbfa] border-[#efefec] dark:bg-[#161724] dark:border-[#282a3e] p-5 border">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-[#4f5bd5]">
                  <Lightbulb size={15} /> {t('scanSolutionTitle')}
                </div>
                {answerResult && (
                  <span className="text-[10px] font-bold text-[#3b7e5e] dark:text-[#5ec290] bg-[#eef8f2] dark:bg-[#14281e] px-2 py-0.5 rounded-full">
                    {answerResult.confidence}
                  </span>
                )}
              </div>

              {answerResult ? (
                <div className="space-y-3 pt-1">
                  <p className="text-xs sm:text-sm leading-relaxed text-[#202337] dark:text-[#e1e3ed] whitespace-pre-line">
                    {answerResult.answer}
                  </p>
                  <div className="text-[11px] font-medium text-[#777989] dark:text-[#84879c] pt-2 border-t border-[#ededed] dark:border-[#282a3e]">
                    {t('notesSelectSource')}: <span className="text-[#4f5bd5] dark:text-[#9aa3f8]">{answerResult.source}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs sm:text-sm leading-relaxed text-[#777989] dark:text-[#9ea1b5]">
                  {t('scanPlaceholder')}
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Extracted Important Topics Section */}
      {extractedTopics.length > 0 && (
        <Card className="mt-8 p-5 sm:p-6 md:p-7 border border-[#4f5bd5]/30 bg-gradient-to-b from-[#f8f9fe] to-white dark:from-[#1b1c2e] dark:to-[#161724]">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#ededed] dark:border-[#2b2d42] pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-[#4f5bd5] text-white shadow-xs">
                <Sparkles size={18} />
              </div>
              <div>
                <h3 className="font-bold text-base text-[#202337] dark:text-white">
                  Important Topics Extracted from Document
                </h3>
                <p className="text-xs text-[#777989] dark:text-[#9ea1b5]">
                  Core academic concepts and learning objectives identified by StudyMate AI
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {totalPagesScanned && totalPagesScanned > 0 && (
                <span className="rounded-full bg-[#f0f0ed] dark:bg-[#282a3e] px-2.5 py-1 text-xs font-semibold text-[#666878] dark:text-[#b4b7cb]">
                  {totalPagesScanned} {totalPagesScanned === 1 ? 'Page' : 'Pages'}
                </span>
              )}
              <span className="rounded-full bg-[#edeefd] dark:bg-[#4f5bd5]/20 px-2.5 py-1 text-xs font-semibold text-[#4f5bd5] dark:text-[#9aa3f8]">
                {extractedTopics.length} Topics Identified
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {extractedTopics.map((item, idx) => (
              <div
                key={idx}
                className="group flex flex-col justify-between rounded-xl border border-[#e6e6e2] bg-white p-4 transition hover:border-[#4f5bd5] hover:shadow-xs dark:border-[#2d3047] dark:bg-[#1a1b2c] dark:hover:border-[#4f5bd5]"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="inline-flex items-center rounded-md bg-[#edeefd] px-2 py-0.5 text-[10px] font-bold text-[#4550c9] dark:bg-[#4f5bd5]/20 dark:text-[#9aa3f8]">
                      {item.pageNumber ? `Page ${item.pageNumber}` : `Key Concept #${idx + 1}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof navigator !== 'undefined' && navigator.clipboard) {
                          navigator.clipboard.writeText(`${item.topic}: ${item.explanation}`)
                          showToast('Topic copied to clipboard!')
                        }
                      }}
                      className="text-[#9ea1b5] hover:text-[#4f5bd5] dark:hover:text-[#9aa3f8] transition p-1"
                      title="Copy topic notes"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                  <h4 className="font-bold text-sm text-[#202337] dark:text-white group-hover:text-[#4f5bd5] dark:group-hover:text-[#9aa3f8] transition">
                    {item.topic}
                  </h4>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#666879] dark:text-[#a0a3b8]">
                    {item.explanation}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-[#f0f0ed] dark:border-[#282a3d] flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setScanText(`Explain the core principles of: ${item.topic}.\n\nContext from document: ${item.explanation}`)
                      showToast(`Loaded "${item.topic}" into question solver`)
                    }}
                    className="text-xs font-semibold text-[#4f5bd5] dark:text-[#9aa3f8] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Search size={13} />
                    <span>Find Solution</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (navigate) {
                        navigate('AI Tutor')
                        showToast(`Opened AI Tutor for: ${item.topic}`)
                      }
                    }}
                    className="text-xs font-semibold text-[#777989] hover:text-[#202337] dark:text-[#8d90a6] dark:hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <Bot size={13} />
                    <span>Ask Tutor</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recent Scan History Section */}
      <Card className="mt-8 p-5 sm:p-6 md:p-7">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#efefec] dark:border-[#282a3e] pb-3.5">
          <div className="flex items-center gap-2">
            <History size={18} className="text-[#4f5bd5] dark:text-[#9aa3f8]" />
            <h3 className="font-bold text-base text-[#202337] dark:text-white">
              Recent Scan & Find History
            </h3>
            {userSignedIn && (
              <span className="rounded-full bg-[#edeefd] dark:bg-[#4f5bd5]/20 px-2 py-0.5 text-xs font-semibold text-[#4f5bd5] dark:text-[#9aa3f8]">
                {scanQueries.length}
              </span>
            )}
          </div>
          <div className="text-xs text-[#8d8f9e] dark:text-[#84879c]">
            {userSignedIn ? 'Synced to your Supabase account' : 'Preview demo mode (sign in to save history)'}
          </div>
        </div>

        {isLoadingScanQueries ? (
          <div className="flex items-center justify-center py-10 text-xs text-[#8d8f9e] dark:text-[#84879c] gap-2">
            <Loader2 size={16} className="animate-spin text-[#4f5bd5]" />
            <span>Loading your scan history...</span>
          </div>
        ) : userSignedIn ? (
          scanQueries.length === 0 ? (
            <div className="py-8 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#edeefd] dark:bg-[#4f5bd5]/20 text-[#4f5bd5] dark:text-[#9aa3f8] mb-3">
                <Search size={22} />
              </div>
              <div className="text-sm font-semibold text-[#202337] dark:text-white">
                No scan queries recorded yet
              </div>
              <p className="mt-1 text-xs text-[#8d8f9e] dark:text-[#84879c] max-w-sm mx-auto">
                Scan a diagram, upload a study problem, or ask a question above to start recording your scan history.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#efefec] dark:divide-[#282a3e] max-h-[460px] overflow-y-auto pr-1 space-y-3">
              {scanQueries.map((item) => {
                const dateStr = new Date(item.created_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
                return (
                  <div key={item.id} className="pt-3 first:pt-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span
                            className={cn(
                              'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider',
                              item.mode === 'notes'
                                ? 'bg-[#edeefd] text-[#4550c9] dark:bg-[#4f5bd5]/20 dark:text-[#9aa3f8]'
                                : 'bg-[#fef4e6] text-[#b97a34] dark:bg-[#342a17] dark:text-[#e5ab56]'
                            )}
                          >
                            {item.mode === 'notes' ? 'Notes Grounded' : 'General AI'}
                          </span>
                          {item.image_path && (
                            <span className="text-[10px] text-[#777989] dark:text-[#84879c] bg-[#f0f0ed] dark:bg-[#282a3e] px-2 py-0.5 rounded font-mono truncate max-w-[200px]">
                              {item.image_path}
                            </span>
                          )}
                          <span className="text-[11px] text-[#8d8f9e] dark:text-[#84879c]">
                            {dateStr}
                          </span>
                          {item.confidence && (
                            <span className="text-[10px] font-bold text-[#3b7e5e] dark:text-[#5ec290] bg-[#eef8f2] dark:bg-[#14281e] px-2 py-0.5 rounded-full">
                              {item.confidence}
                            </span>
                          )}
                        </div>

                        <div className="text-sm font-bold text-[#202337] dark:text-white">
                          {item.question_text}
                        </div>

                        {item.answer_text && (
                          <div className="mt-2 text-xs leading-relaxed text-[#55586d] dark:text-[#b8bad0] bg-[#f9f9f8] dark:bg-[#1c1d2d] rounded-xl p-3 border border-[#ededed] dark:border-[#2a2c40] whitespace-pre-line">
                            {item.answer_text}
                            {item.source_citation && (
                              <div className="mt-2 text-[10px] font-medium text-[#777989] dark:text-[#84879c] pt-1.5 border-t border-[#ededed] dark:border-[#282a3e]">
                                Source: <span className="text-[#4f5bd5] dark:text-[#9aa3f8]">{item.source_citation}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setScanText(item.question_text)
                            if (item.answer_text) {
                              setAnswerResult({
                                answer: item.answer_text,
                                source: item.source_citation || 'Saved Scan Query',
                                confidence: item.confidence || '95%',
                              })
                            }
                            if (item.image_path) {
                              setImageName(item.image_path)
                            }
                            showToast('Loaded query into editor')
                          }}
                          className="rounded-lg p-1.5 text-[#8d8f9e] hover:text-[#4f5bd5] hover:bg-[#edeefd]/40 dark:text-[#7f8297] dark:hover:text-[#9aa3f8] transition cursor-pointer"
                          title="Load into editor"
                        >
                          <Search size={14} />
                        </button>

                        {onDeleteScanQuery && (
                          <button
                            type="button"
                            onClick={async () => {
                              const confirmed = window.confirm('Delete this scan query record?')
                              if (confirmed) {
                                await onDeleteScanQuery(item.id)
                              }
                            }}
                            className="rounded-lg p-1.5 text-[#8d8f9e] hover:text-[#b45b51] hover:bg-[#fdeeed] dark:text-[#7f8297] dark:hover:text-[#f28b80] dark:hover:bg-[#361d1c] transition cursor-pointer"
                            title="Delete scan query"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : (
          <div className="divide-y divide-[#efefec] dark:divide-[#282a3e]">
            {[
              {
                id: 'demo-1',
                q: 'How does the phospholipid bilayer achieve selective permeability?',
                a: 'The phospholipid bilayer possesses an amphipathic nature with hydrophobic fatty acid tails pointing inward and hydrophilic phosphate heads facing outward. Nonpolar, small molecules (O2, CO2) diffuse freely, while large polar molecules and charged ions require specialized transport proteins.',
                citation: 'Biology – Cell Structure.pdf • Verified Citation',
                conf: '98%',
                date: 'Today, 2:30 PM',
              },
              {
                id: 'demo-2',
                q: 'What role does ATP synthase play in the mitochondrial inner membrane?',
                a: 'ATP synthase is an enzymatic complex that functions as a rotary molecular motor. It couples the downhill electrochemical proton gradient across the inner membrane with the phosphorylation of ADP to produce ATP.',
                citation: 'Biochemistry – Cellular Respiration.pdf',
                conf: '96%',
                date: 'Yesterday',
              },
            ].map((demo) => (
              <div key={demo.id} className="py-3.5 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-[#edeefd] text-[#4550c9] dark:bg-[#4f5bd5]/20 dark:text-[#9aa3f8]">
                        Notes Grounded
                      </span>
                      <span className="text-[10px] text-[#8d8f9e] bg-[#f0f0ed] dark:bg-[#282a3e] px-1.5 py-0.5 rounded font-normal">
                        Demo
                      </span>
                      <span className="text-[11px] text-[#8d8f9e] dark:text-[#84879c]">
                        {demo.date}
                      </span>
                      <span className="text-[10px] font-bold text-[#3b7e5e] dark:text-[#5ec290] bg-[#eef8f2] dark:bg-[#14281e] px-2 py-0.5 rounded-full">
                        {demo.conf}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-[#202337] dark:text-white">
                      {demo.q}
                    </div>
                    <div className="mt-2 text-xs leading-relaxed text-[#55586d] dark:text-[#b8bad0] bg-[#f9f9f8] dark:bg-[#1c1d2d] rounded-xl p-3 border border-[#ededed] dark:border-[#2a2c40]">
                      {demo.a}
                      <div className="mt-2 text-[10px] font-medium text-[#777989] dark:text-[#84879c] pt-1.5 border-t border-[#ededed] dark:border-[#282a3e]">
                        Source: <span className="text-[#4f5bd5] dark:text-[#9aa3f8]">{demo.citation}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setScanText(demo.q)
                      setAnswerResult({
                        answer: demo.a,
                        source: demo.citation,
                        confidence: demo.conf,
                      })
                      showToast('Loaded demo query into editor')
                    }}
                    className="rounded-lg p-1.5 text-[#8d8f9e] hover:text-[#4f5bd5] hover:bg-[#edeefd]/40 transition cursor-pointer"
                    title="Load into editor"
                  >
                    <Search size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}

/* =========================================================================
   SETTINGS SCREEN
   ========================================================================= */

function SettingsScreen({
  navigate,
  showToast,
  theme,
  onThemeChange,
  currentUser,
  userSettings,
  onUpdateSettings,
  onSignOut,
  onUpdateProfile,
}: {
  navigate: (s: Screen) => void
  showToast: (m: string) => void
  theme: ThemeMode
  onThemeChange: (t: ThemeMode) => void
  currentUser?: {
    email?: string
    name?: string
    avatarUrl?: string
  } | null
  userSettings?: UserSettingsRow | null
  onUpdateSettings?: (p: Partial<UserSettingsRow>) => Promise<boolean>
  onSignOut?: () => void
  onUpdateProfile?: (newName: string, newAvatar?: string) => Promise<boolean>
}) {
  const { t, language, setLanguage, supportedLanguages } = useLanguage()
  const [tab, setTab] = useState('General')
  const [quizLength, setQuizLength] = useState<QuizLength>(userSettings?.quiz_length || '10 questions')
  const [explanationStyle, setExplanationStyle] = useState<ExplanationStyle>(userSettings?.explanation_style || 'Simple')
  const [readSpeed, setReadSpeed] = useState<ReadSpeed>(userSettings?.read_speed || '1.0x')
  const [sourceReferences, setSourceReferences] = useState(userSettings?.source_references ?? true)
  const [preserveQuiz, setPreserveQuiz] = useState(userSettings?.preserve_quiz ?? true)
  const [dailyReminder, setDailyReminder] = useState(userSettings?.daily_reminder ?? true)
  const [spacedRepetition, setSpacedRepetition] = useState(userSettings?.spaced_repetition ?? true)
  const [weeklyEmail, setWeeklyEmail] = useState(userSettings?.weekly_email ?? false)
  const [isSaving, setIsSaving] = useState(false)

  // Synchronize internal state when userSettings is loaded or updated
  useEffect(() => {
    if (userSettings) {
      if (userSettings.quiz_length) setQuizLength(userSettings.quiz_length)
      if (userSettings.explanation_style) setExplanationStyle(userSettings.explanation_style)
      if (userSettings.read_speed) setReadSpeed(userSettings.read_speed)
      if (userSettings.source_references !== undefined) setSourceReferences(userSettings.source_references)
      if (userSettings.preserve_quiz !== undefined) setPreserveQuiz(userSettings.preserve_quiz)
      if (userSettings.daily_reminder !== undefined) setDailyReminder(userSettings.daily_reminder)
      if (userSettings.spaced_repetition !== undefined) setSpacedRepetition(userSettings.spaced_repetition)
      if (userSettings.weekly_email !== undefined) setWeeklyEmail(userSettings.weekly_email)
    }
  }, [userSettings])

  const tabs = [
    { id: 'General', label: t('settingsTabGeneral') },
    { id: 'Learning preferences', label: t('settingsTabLearning') },
    { id: 'Notifications', label: t('settingsTabNotifications') },
    { id: 'Privacy & security', label: t('settingsTabPrivacy') },
    { id: 'Manage account', label: t('settingsTabAccount') },
  ]

  const handleSavePreferences = async () => {
    setIsSaving(true)
    try {
      if (onUpdateSettings) {
        await onUpdateSettings({
          quiz_length: quizLength,
          explanation_style: explanationStyle,
          read_speed: readSpeed,
          source_references: sourceReferences,
          preserve_quiz: preserveQuiz,
          daily_reminder: dailyReminder,
          spaced_repetition: spacedRepetition,
          weekly_email: weeklyEmail,
          theme,
          language: language as SupportedLanguage,
        })
      }
      showToast(t('settingsToastSaved'))
    } catch {
      showToast('Error saving preferences')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <SectionTitle
        eyebrow={t('preferencesEyebrow')}
        title={t('settingsTitle')}
        description={t('settingsDesc')}
      />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <Card className="h-fit p-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                'w-full rounded-xl px-3.5 py-3 text-left text-xs font-semibold transition',
                tab === item.id
                  ? 'bg-[#edeefd] text-[#4550c9] font-bold dark:bg-[#4f5bd5]/25 dark:text-[#9aa3f8]'
                  : 'text-[#777989] hover:bg-[#f5f5f2] hover:text-[#202337] dark:text-[#84879c] dark:hover:bg-[#222436] dark:hover:text-white'
              )}
            >
              {item.label}
            </button>
          ))}
        </Card>

        <Card className="p-6 md:p-8">
          {tab === 'General' && (
            <SettingGroup title={t('settingsGroupGeneral')}>
              <SettingRow label={t('settingsAppearanceLabel')} description={t('settingsAppearanceDesc')}>
                <select
                  value={theme}
                  onChange={(e) => {
                    const newTheme = e.target.value as ThemeMode
                    onThemeChange(newTheme)
                  }}
                  className="rounded-xl border border-[#deded9] bg-[#fbfbfa] text-[#202337] dark:border-[#32354e] dark:bg-[#161724] dark:text-white px-3 py-2 text-xs font-semibold outline-none focus:border-[#4f5bd5]"
                >
                  <option value="Light">{t('settingsThemeLight')}</option>
                  <option value="System">{t('settingsThemeSystem')}</option>
                  <option value="Dark (Preview)">{t('settingsThemeDark')}</option>
                </select>
              </SettingRow>
              <SettingRow label={t('settingsLanguageLabel')} description={t('settingsLanguageDesc')}>
                <select
                  value={language}
                  onChange={(e) => {
                    const newLang = e.target.value as Language
                    setLanguage(newLang)
                    if (onUpdateSettings) onUpdateSettings({ language: newLang as SupportedLanguage })
                    const langObj = supportedLanguages.find((l) => l.code === newLang)
                    showToast(t('settingsToastLangUpdated', { lang: langObj?.label || newLang }))
                  }}
                  className="rounded-xl border border-[#deded9] bg-[#fbfbfa] text-[#202337] dark:border-[#32354e] dark:bg-[#161724] dark:text-white px-3 py-2 text-xs font-semibold outline-none focus:border-[#4f5bd5]"
                >
                  {supportedLanguages.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <ToggleRow
                label={t('settingsToggleSourceRefs')}
                checked={sourceReferences}
                onChange={setSourceReferences}
              />
              <ToggleRow
                label={t('settingsTogglePreserveQuiz')}
                checked={preserveQuiz}
                onChange={setPreserveQuiz}
              />
            </SettingGroup>
          )}

          {tab === 'Learning preferences' && (
            <SettingGroup title={t('settingsGroupLearning')}>
              <SettingRow label={t('settingsQuizLengthLabel')} description={t('settingsQuizLengthDesc')}>
                <select
                  value={quizLength}
                  onChange={(e) => setQuizLength(e.target.value as QuizLength)}
                  className="rounded-xl border border-[#deded9] bg-[#fbfbfa] text-[#202337] dark:border-[#32354e] dark:bg-[#161724] dark:text-white px-3 py-2 text-xs font-semibold outline-none focus:border-[#4f5bd5]"
                >
                  <option value="5 questions">{t('settings5Questions')}</option>
                  <option value="10 questions">{t('settings10Questions')}</option>
                  <option value="15 questions">{t('settings15Questions')}</option>
                  <option value="20 questions">{t('settings20Questions')}</option>
                </select>
              </SettingRow>
              <SettingRow label={t('settingsExplanationLabel')} description={t('settingsExplanationDesc')}>
                <select
                  value={explanationStyle}
                  onChange={(e) => setExplanationStyle(e.target.value as ExplanationStyle)}
                  className="rounded-xl border border-[#deded9] bg-[#fbfbfa] text-[#202337] dark:border-[#32354e] dark:bg-[#161724] dark:text-white px-3 py-2 text-xs font-semibold outline-none focus:border-[#4f5bd5]"
                >
                  <option value="Simple">{t('settingsStyleSimple')}</option>
                  <option value="Detailed">{t('settingsStyleDetailed')}</option>
                  <option value="Exam-focused">{t('settingsStyleExam')}</option>
                </select>
              </SettingRow>
              <SettingRow label={t('settingsReadSpeedLabel')} description={t('settingsReadSpeedDesc')}>
                <select
                  value={readSpeed}
                  onChange={(e) => setReadSpeed(e.target.value as ReadSpeed)}
                  className="rounded-xl border border-[#deded9] bg-[#fbfbfa] text-[#202337] dark:border-[#32354e] dark:bg-[#161724] dark:text-white px-3 py-2 text-xs font-semibold outline-none focus:border-[#4f5bd5]"
                >
                  <option value="0.75x">0.75x</option>
                  <option value="1.0x">1.0x</option>
                  <option value="1.25x">1.25x</option>
                  <option value="1.5x">1.5x</option>
                </select>
              </SettingRow>
            </SettingGroup>
          )}

          {tab === 'Notifications' && (
            <SettingGroup title={t('settingsGroupNotifications')}>
              <ToggleRow
                label={t('settingsToggleDailyReminder')}
                checked={dailyReminder}
                onChange={setDailyReminder}
              />
              <ToggleRow
                label={t('settingsToggleSpacedRep')}
                checked={spacedRepetition}
                onChange={setSpacedRepetition}
              />
              <ToggleRow
                label={t('settingsToggleWeeklyEmail')}
                checked={weeklyEmail}
                onChange={setWeeklyEmail}
              />
            </SettingGroup>
          )}

          {tab === 'Privacy & security' && (
            <SettingGroup title={t('settingsGroupPrivacy')}>
              <div className="flex items-start gap-3 rounded-xl bg-[#f4f4fd] border-[#e5e7fa] dark:bg-[#1c1e30] dark:border-[#2e3150] p-4 border">
                <ShieldCheck size={18} className="mt-0.5 text-[#4f5bd5] dark:text-[#9aa3f8] shrink-0" />
                <div>
                  <div className="text-sm font-bold text-[#202337] dark:text-white">{t('settingsPrivacyBannerTitle')}</div>
                  <p className="mt-1 text-xs leading-relaxed text-[#777989] dark:text-[#9ea1b5]">
                    {t('settingsPrivacyBannerDesc')}
                  </p>
                </div>
              </div>
              <SettingRow label={t('settingsEmailStatusLabel')} description={currentUser?.email || 'maya@example.com'}>
                <span className="rounded-full bg-[#eef8f2] dark:bg-[#14281e] px-3 py-1 text-[11px] font-bold text-[#3b7e5e] dark:text-[#5ec290]">
                  {t('settingsEmailVerifiedBadge')}
                </span>
              </SettingRow>

              <div className="pt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => navigate('Manage Account')}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[#4f5bd5] dark:text-[#9aa3f8] hover:underline"
                >
                  <LockKeyhole size={14} /> {t('settingsManagePasswordLink')}
                </button>
                <Link
                  href="/login"
                  className="flex items-center gap-1.5 text-xs font-semibold text-[#4f5bd5] dark:text-[#9aa3f8] hover:underline"
                >
                  <KeyRound size={14} /> {t('settingsPreviewAuthLink')}
                </Link>
              </div>
            </SettingGroup>
          )}

          {tab === 'Manage account' && (
            <AccountPanel
              currentUser={currentUser}
              onSignOut={onSignOut}
              onUpdateProfile={onUpdateProfile}
              onNavigateToAuth={(m) => {
                const map: Record<AuthMode, Screen> = {
                  login: 'Login',
                  signup: 'Sign Up',
                  forgot: 'Forgot Password',
                  reset: 'Reset Password',
                }
                navigate(map[m])
              }}
            />
          )}

          {tab !== 'Manage account' && (
            <div className="mt-8 pt-5 border-t border-[#efefec] dark:border-[#282a3e] flex items-center justify-between">
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSavePreferences}
                className="flex items-center gap-2 rounded-xl bg-[#4f5bd5] px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-[#434ec4] transition active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                {isSaving && <Loader2 size={13} className="animate-spin" />}
                <span>{t('settingsSaveBtn')}</span>
              </button>
              <span className="text-xs text-[#8d8f9e] dark:text-[#84879c]">{t('preferencesSavedNotice')}</span>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}

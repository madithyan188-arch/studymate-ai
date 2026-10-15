import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

let client: ReturnType<typeof createBrowserClient<Database>> | undefined

export interface SupabaseConfigStatus {
  isConfigured: boolean
  hasUrl: boolean
  hasKey: boolean
  isPlaceholder: boolean
  message?: string
}

function isPlaceholderKey(key?: string | null): boolean {
  if (!key) return true
  const lower = key.trim().toLowerCase()
  return (
    lower.length === 0 ||
    lower === 'paste_the_complete_publishable_key_here' ||
    lower.includes('paste') ||
    lower.includes('your_') ||
    lower.includes('placeholder') ||
    lower.includes('example') ||
    lower === 'null' ||
    lower === 'undefined'
  )
}

export function getSupabaseConfigStatus(): SupabaseConfigStatus {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim()

  const hasUrl = Boolean(url && url.startsWith('https://'))
  const isPlaceholder = isPlaceholderKey(key)
  const hasKey = Boolean(key && !isPlaceholder)

  let message: string | undefined
  if (!hasUrl && !hasKey) {
    message =
      'Supabase is not configured. Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) are set in .env.local.'
  } else if (!hasUrl) {
    message =
      'Supabase Project URL is missing. Please ensure NEXT_PUBLIC_SUPABASE_URL is set in .env.local.'
  } else if (!hasKey) {
    message = isPlaceholder
      ? 'Supabase key is currently a placeholder. Please ensure NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local has your complete Supabase anon/publishable key.'
      : 'Supabase is partially configured with Project URL. Please ensure NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local has your complete Supabase anon/publishable key.'
  }

  return {
    isConfigured: hasUrl && hasKey,
    hasUrl,
    hasKey,
    isPlaceholder,
    message,
  }
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfigStatus().isConfigured
}

export function createClient() {
  if (client) return client

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const supabaseKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim()

  if (!supabaseUrl || !supabaseKey || isPlaceholderKey(supabaseKey)) {
    throw new Error(
      'Supabase client initialization failed: Missing or placeholder NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variable.'
    )
  }

  client = createBrowserClient<Database>(supabaseUrl, supabaseKey)
  return client
}

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

function isPlaceholderKey(key?: string | null): boolean {
  if (!key) return true
  const lower = key.trim().toLowerCase()
  return (
    lower.length === 0 ||
    lower.includes('paste') ||
    lower.includes('your_') ||
    lower.includes('placeholder') ||
    lower.includes('example') ||
    lower === 'test' ||
    lower === 'null' ||
    lower === 'undefined'
  )
}

function resolveAdminKey(): string | null {
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (serviceRole && !isPlaceholderKey(serviceRole)) {
    return serviceRole
  }
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()
  if (secretKey && !isPlaceholderKey(secretKey)) {
    return secretKey
  }
  return null
}

/**
 * Ensures admin client can NEVER be instantiated or executed in a browser environment.
 */
function assertServerEnvironment() {
  if (typeof window !== 'undefined') {
    throw new Error(
      'FATAL SECURITY VIOLATION: Supabase Admin client cannot be used in a browser environment.'
    )
  }
}

export function isSupabaseAdminConfigured(): boolean {
  assertServerEnvironment()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = resolveAdminKey()

  if (!url || !key) return false
  if (!url.startsWith('https://')) return false
  return true
}

export function createAdminClient() {
  assertServerEnvironment()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceKey = resolveAdminKey()

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      'Supabase admin client initialization failed: Missing or placeholder SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) environment variable on the server.'
    )
  }

  return createSupabaseClient<Database>(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

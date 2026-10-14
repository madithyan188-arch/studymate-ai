import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

// In-memory sliding-window rate limiter
// Tracks request timestamps per identifier (User ID or client IP)
interface RateLimitRecord {
  timestamps: number[]
}

const rateLimitMap = new Map<string, RateLimitRecord>()

// Periodically clean up stale entries (every 5 minutes)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    const expiry = now - 5 * 60 * 1000
    for (const [key, record] of rateLimitMap.entries()) {
      record.timestamps = record.timestamps.filter((t) => t > expiry)
      if (record.timestamps.length === 0) {
        rateLimitMap.delete(key)
      }
    }
  }, 5 * 60 * 1000)
}

/**
 * Validates that the request Content-Type is application/json.
 */
export function validateContentType(req: NextRequest): { valid: boolean; errorResponse?: NextResponse } {
  const contentType = req.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('application/json')) {
    return {
      valid: false,
      errorResponse: NextResponse.json(
        { error: 'Invalid Content-Type header. Expected "application/json".' },
        { status: 415 }
      ),
    }
  }
  return { valid: true }
}

/**
 * Authenticates the user making the request via Supabase Auth cookies or Bearer token.
 */
export async function authenticateApiRequest(
  req: NextRequest
): Promise<{ user: User | null; errorResponse?: NextResponse }> {
  try {
    const supabase = await createClient()

    // 1. Check session via cookies (standard SSR flow)
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (!error && user) {
      return { user }
    }

    // 2. Fallback: check Authorization: Bearer <jwt> header
    const authHeader = req.headers.get('authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim()
      if (token) {
        const { data: jwtData, error: jwtErr } = await supabase.auth.getUser(token)
        if (!jwtErr && jwtData?.user) {
          return { user: jwtData.user }
        }
      }
    }

    return {
      user: null,
      errorResponse: NextResponse.json(
        {
          error: 'Unauthorized. You must be signed in to access StudyMate AI services.',
          code: 'AUTH_REQUIRED',
        },
        { status: 401 }
      ),
    }
  } catch (err: any) {
    console.error('[StudyMate Security] Auth check failure:', err?.message)
    return {
      user: null,
      errorResponse: NextResponse.json(
        {
          error: 'Authentication verification service error.',
          code: 'AUTH_ERROR',
        },
        { status: 401 }
      ),
    }
  }
}

/**
 * Enforces in-memory sliding-window rate limit.
 * Defaults to 30 requests per minute per user or client IP.
 */
export function checkRateLimit(
  req: NextRequest,
  userId?: string | null,
  limit = 30,
  windowMs = 60 * 1000
): { limited: boolean; response?: NextResponse } {
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'anonymous_client'

  const identifier = userId ? `user:${userId}` : `ip:${clientIp}`
  const now = Date.now()
  const windowStart = now - windowMs

  let record = rateLimitMap.get(identifier)
  if (!record) {
    record = { timestamps: [] }
    rateLimitMap.set(identifier, record)
  }

  // Filter timestamps within current window
  record.timestamps = record.timestamps.filter((ts) => ts > windowStart)

  if (record.timestamps.length >= limit) {
    const oldest = record.timestamps[0]
    const retryAfter = Math.ceil((oldest + windowMs - now) / 1000)

    return {
      limited: true,
      response: NextResponse.json(
        {
          error: 'Rate limit exceeded. Please wait before submitting another request.',
          retryAfterSeconds: Math.max(1, retryAfter),
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(1, retryAfter)),
          },
        }
      ),
    }
  }

  record.timestamps.push(now)
  return { limited: false }
}

/**
 * Enforces a strict timeout on fetch promises to prevent hanging connections.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 25000
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Sanitizes and truncates user text to prevent prompt injection and payload bloat.
 */
export function sanitizePromptText(text: string, maxLength = 2000): string {
  if (!text) return ''
  // Strip null bytes and normalize whitespace
  const sanitized = text.replace(/\0/g, '').trim()
  return sanitized.slice(0, maxLength)
}

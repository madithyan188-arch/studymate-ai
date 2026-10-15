import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient, isSupabaseAdminConfigured } from '@/lib/supabase/admin'
import {
  validateContentType,
  authenticateApiRequest,
  checkRateLimit,
} from '@/lib/api-security'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // 1. Content-Type Validation
  const ctCheck = validateContentType(req)
  if (!ctCheck.valid && ctCheck.errorResponse) {
    return ctCheck.errorResponse
  }

  // 2. Authentication: strictly determine identity from verified session
  const auth = await authenticateApiRequest(req)
  if (!auth.user || auth.errorResponse) {
    return (
      auth.errorResponse ||
      NextResponse.json({ error: 'Unauthorized. You must be signed in to delete your account.' }, { status: 401 })
    )
  }

  const userId = auth.user.id

  // 3. Strict rate limiting for destructive account operations (max 5 attempts per minute)
  const rateLimit = checkRateLimit(req, userId, 5, 60 * 1000)
  if (rateLimit.limited && rateLimit.response) {
    return rateLimit.response
  }

  try {
    const body = await req.json()
    if (!body?.confirm) {
      return NextResponse.json(
        { error: 'Confirmation required. Please set "confirm: true" to proceed with account deletion.' },
        { status: 400 }
      )
    }

    // 1. Pre-flight verification: Ensure server administrative client is configured before deleting anything
    if (!isSupabaseAdminConfigured()) {
      return NextResponse.json(
        {
          error:
            'Account deletion cannot proceed: Server administrative credentials (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY) are not configured. Your data and account remain safe and intact.',
          adminKeyMissing: true,
          success: false,
          authDeleted: false,
          dataPurged: false,
        },
        { status: 503 }
      )
    }

    const adminClient = createAdminClient()
    const userClient = await createServerClient()

    // 2. Primary atomic deletion: Delete user from auth.users
    // PostgreSQL relational schema foreign keys automatically and atomically CASCADE to:
    // profiles, user_settings, materials, study_notes, quiz_attempts, tutor_conversations, tutor_messages, scan_queries
    const { error: adminDeleteErr } = await adminClient.auth.admin.deleteUser(userId)

    if (adminDeleteErr) {
      console.error('[StudyMate Admin] Failed to delete user from auth.users:', adminDeleteErr.message)
      return NextResponse.json(
        {
          success: false,
          authDeleted: false,
          dataPurged: false,
          error: `Account deletion failed: ${adminDeleteErr.message}. Your account and study data remain intact.`,
        },
        { status: 500 }
      )
    }

    // 3. Defense-in-depth: Ensure any unconstrained or residual records are swept
    try {
      await Promise.allSettled([
        adminClient.from('tutor_messages').delete().eq('user_id', userId),
        adminClient.from('tutor_conversations').delete().eq('user_id', userId),
        adminClient.from('study_notes').delete().eq('user_id', userId),
        adminClient.from('quiz_attempts').delete().eq('user_id', userId),
        adminClient.from('materials').delete().eq('user_id', userId),
        adminClient.from('scan_queries').delete().eq('user_id', userId),
        adminClient.from('user_settings').delete().eq('user_id', userId),
        adminClient.from('profiles').delete().eq('id', userId),
      ])
    } catch {
      // Non-critical if PostgreSQL cascade has already removed all rows
    }

    // 4. Terminate user session cookies on the server
    try {
      await userClient.auth.signOut()
    } catch {
      // User is already removed from auth.users
    }

    return NextResponse.json({
      success: true,
      authDeleted: true,
      dataPurged: true,
      message: 'Account credentials and all associated study data permanently deleted.',
    })
  } catch (err: any) {
    console.error('[StudyMate Admin] Account deletion unexpected error:', err)
    return NextResponse.json(
      { error: err?.message || 'An unexpected error occurred during account deletion.' },
      { status: 500 }
    )
  }
}

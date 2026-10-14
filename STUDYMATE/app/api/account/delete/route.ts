import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  validateContentType,
  authenticateApiRequest,
  checkRateLimit,
} from '@/lib/api-security'
import type { Database } from '@/lib/supabase/database.types'

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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    // Helper: Purge user's study records under user's authenticated session
    const userClient = await createServerClient()
    const purgeErrors: string[] = []

    // Child-to-parent deletion order to respect foreign key integrity
    const { error: msgErr } = await userClient.from('tutor_messages').delete().eq('user_id', userId)
    if (msgErr) purgeErrors.push(`Tutor messages: ${msgErr.message}`)

    const { error: convErr } = await userClient.from('tutor_conversations').delete().eq('user_id', userId)
    if (convErr) purgeErrors.push(`Tutor conversations: ${convErr.message}`)

    const { error: notesErr } = await userClient.from('study_notes').delete().eq('user_id', userId)
    if (notesErr) purgeErrors.push(`Study notes: ${notesErr.message}`)

    const { error: quizErr } = await userClient.from('quiz_attempts').delete().eq('user_id', userId)
    if (quizErr) purgeErrors.push(`Quiz attempts: ${quizErr.message}`)

    const { error: matErr } = await userClient.from('materials').delete().eq('user_id', userId)
    if (matErr) purgeErrors.push(`Study materials: ${matErr.message}`)

    const { error: scanErr } = await userClient.from('scan_queries').delete().eq('user_id', userId)
    if (scanErr) purgeErrors.push(`Scan history: ${scanErr.message}`)

    if (purgeErrors.length > 0) {
      return NextResponse.json(
        {
          error: `Failed to purge dependent records: ${purgeErrors.join('; ')}`,
          success: false,
          authDeleted: false,
        },
        { status: 500 }
      )
    }

    // 4. Supabase Admin API Auth User Deletion
    const isPlaceholder = (k?: string) =>
      !k ||
      k.trim() === '' ||
      k.toUpperCase().includes('YOUR_') ||
      k === 'placeholder' ||
      k === 'test'

    if (!serviceRoleKey || isPlaceholder(serviceRoleKey) || !supabaseUrl) {
      // Data is purged, but server-side auth user deletion requires administrative key
      return NextResponse.json(
        {
          success: true,
          authDeleted: false,
          dataPurged: true,
          message:
            'All study materials, notes, quiz attempts, and chat records were permanently purged. Permanent deletion of auth credentials requires SUPABASE_SERVICE_ROLE_KEY to be configured on the server.',
          adminKeyMissing: true,
        },
        { status: 200 }
      )
    }

    // Initialize Supabase Admin client with service-role key (server-side only, never leaked)
    const adminClient = createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const { error: adminDeleteErr } = await adminClient.auth.admin.deleteUser(userId)

    if (adminDeleteErr) {
      console.error('[StudyMate Admin] Failed to delete user from auth.users:', adminDeleteErr.message)
      return NextResponse.json(
        {
          success: false,
          authDeleted: false,
          dataPurged: true,
          error: `Data records purged, but auth user deletion failed: ${adminDeleteErr.message}`,
        },
        { status: 500 }
      )
    }

    // Also terminate user session on the server
    await userClient.auth.signOut()

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

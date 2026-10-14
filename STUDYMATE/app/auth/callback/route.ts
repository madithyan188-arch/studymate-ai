import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
  const errorParam = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  if (errorParam) {
    const errorUrl = new URL('/login', origin)
    errorUrl.searchParams.set('error', errorParam)
    if (errorDescription) {
      errorUrl.searchParams.set('error_description', errorDescription)
    }
    return NextResponse.redirect(errorUrl)
  }

  if (code) {
    try {
      const supabase = await createClient()
      const { error } = await supabase.auth.exchangeCodeForSession(code)

      if (!error) {
        const forwardedHost = request.headers.get('x-forwarded-host')
        const isLocalEnv = process.env.NODE_ENV === 'development'

        const targetPath = next.startsWith('/') ? next : `/${next}`
        if (isLocalEnv) {
          return NextResponse.redirect(`${origin}${targetPath}`)
        } else if (forwardedHost) {
          return NextResponse.redirect(`https://${forwardedHost}${targetPath}`)
        } else {
          return NextResponse.redirect(`${origin}${targetPath}`)
        }
      }

      console.error('Supabase code exchange error:', error)
      const errorUrl = new URL('/login', origin)
      errorUrl.searchParams.set('error', 'session_exchange_failed')
      errorUrl.searchParams.set('error_description', error.message)
      return NextResponse.redirect(errorUrl)
    } catch (err: any) {
      console.error('Unexpected callback error:', err)
      const errorUrl = new URL('/login', origin)
      errorUrl.searchParams.set('error', 'unexpected_error')
      errorUrl.searchParams.set('error_description', err?.message || 'Authentication failed')
      return NextResponse.redirect(errorUrl)
    }
  }

  // If no code is present
  return NextResponse.redirect(`${origin}/login`)
}

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function safeParseApiResponse<T = any>(
  res: Response
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const status = res.status
  try {
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      const text = await res.text()
      const isHtml = text.trim().startsWith('<') || text.includes('<html')
      return {
        ok: false,
        status,
        error: isHtml
          ? `Server returned status ${status}. The request may have timed out or exceeded payload limits.`
          : text.slice(0, 300) || `Request failed with status ${status}.`,
      }
    }
    const data = await res.json()
    return {
      ok: res.ok,
      status,
      data,
      error: !res.ok ? data?.error || data?.message || `Request failed with status ${status}` : undefined,
    }
  } catch (err: any) {
    return {
      ok: false,
      status,
      error: err?.message || 'Failed to parse response from server.',
    }
  }
}


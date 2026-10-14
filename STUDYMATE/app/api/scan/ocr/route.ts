import { NextRequest, NextResponse } from 'next/server'
import {
  validateContentType,
  authenticateApiRequest,
  checkRateLimit,
  fetchWithTimeout,
  sanitizePromptText,
} from '@/lib/api-security'
import { extractText } from 'unpdf'

export interface ExtractedTopic {
  topic: string
  explanation: string
  pageNumber?: number
}

interface OCRRequestBody {
  imageBase64: string
  mimeType?: string
  fileName?: string
  language?: string
}

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ml: 'Malayalam (മലയാളം)',
  hi: 'Hindi (हिन्दी)',
  ta: 'Tamil (தமிழ்)',
}

/**
 * Uses Gemini or OpenAI to extract 3 to 6 structured study topics with pedagogical explanations
 * and page numbers from document text.
 */
async function extractTopicsWithAI(
  text: string,
  language: string,
  geminiKey?: string,
  openAiKey?: string
): Promise<{ topics: ExtractedTopic[]; provider?: string }> {
  const targetLanguage = LANGUAGE_NAMES[language] || 'English'
  // Truncate to first 10,000 characters to stay within token limits while preserving core content
  const truncatedText = text.slice(0, 10000)

  const systemPrompt = `You are StudyMate AI, an expert academic document analyzer.
Analyze the provided study document text and extract between 3 and 6 of the most important core study topics, key concepts, or learning objectives.
For each topic, provide:
1. "topic": A concise, clear title (3-6 words).
2. "explanation": A clear pedagogical summary explaining the key concept (1-2 sentences).
3. "pageNumber": The primary page number (integer) where this concept is discussed if mentioned in the text (e.g. from page markers like '--- Page X ---'), or null if unknown.

CRITICAL INSTRUCTIONS:
- Language: You MUST write the topic titles and explanations in ${targetLanguage}.
- Output Format: Return strictly a valid JSON array of objects with keys "topic", "explanation", and "pageNumber".
- Do not output markdown code fences or any conversational filler. Return only the JSON array.`

  const userPrompt = `Document Excerpt:\n${truncatedText}`

  // 1. Try Gemini
  if (geminiKey) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(
        geminiKey
      )}`
      const res = await fetchWithTimeout(
        geminiUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json',
              maxOutputTokens: 1200,
            },
          }),
        },
        20000
      )

      if (res.ok) {
        const data = await res.json()
        const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        if (rawJson) {
          const parsed = JSON.parse(rawJson)
          if (Array.isArray(parsed)) {
            const validTopics = parsed
              .filter((item: any) => item && typeof item.topic === 'string' && item.topic.trim())
              .map((item: any) => ({
                topic: String(item.topic).trim(),
                explanation: String(item.explanation || '').trim(),
                pageNumber: typeof item.pageNumber === 'number' ? item.pageNumber : undefined,
              }))
            if (validTopics.length > 0) {
              return { topics: validTopics, provider: 'gemini' }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[StudyMate OCR] Gemini topic extraction failed:', e)
    }
  }

  // 2. Try OpenAI fallback
  if (openAiKey) {
    try {
      const res = await fetchWithTimeout(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openAiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.2,
            max_tokens: 1200,
            response_format: { type: 'json_object' },
          }),
        },
        20000
      )

      if (res.ok) {
        const data = await res.json()
        const content = data?.choices?.[0]?.message?.content?.trim()
        if (content) {
          const parsed = JSON.parse(content)
          const list = Array.isArray(parsed) ? parsed : parsed.topics || parsed.items || []
          if (Array.isArray(list)) {
            const validTopics = list
              .filter((item: any) => item && typeof item.topic === 'string' && item.topic.trim())
              .map((item: any) => ({
                topic: String(item.topic).trim(),
                explanation: String(item.explanation || '').trim(),
                pageNumber: typeof item.pageNumber === 'number' ? item.pageNumber : undefined,
              }))
            if (validTopics.length > 0) {
              return { topics: validTopics, provider: 'openai' }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[StudyMate OCR] OpenAI topic extraction failed:', e)
    }
  }

  return { topics: [] }
}

export async function POST(req: NextRequest) {
  // 1. Content-Type Validation
  const ctCheck = validateContentType(req)
  if (!ctCheck.valid && ctCheck.errorResponse) {
    return ctCheck.errorResponse
  }

  // 2. IP-Level Rate Limiting (Defense-in-depth against endpoint flooding)
  const ipRateLimit = checkRateLimit(req, null, 30, 60 * 1000)
  if (ipRateLimit.limited && ipRateLimit.response) {
    return ipRateLimit.response
  }

  // 3. Authentication Requirement
  const auth = await authenticateApiRequest(req)
  if (!auth.user && auth.errorResponse) {
    return auth.errorResponse
  }

  // 4. Sliding-window Rate Limiting (15 heavy OCR/PDF operations per minute per user)
  const rateLimit = checkRateLimit(req, auth.user?.id, 15, 60 * 1000)
  if (rateLimit.limited && rateLimit.response) {
    return rateLimit.response
  }

  try {
    const body: OCRRequestBody = await req.json()
    const { imageBase64, mimeType = 'image/jpeg', fileName, language = 'en' } = body

    if (!imageBase64 || !imageBase64.trim()) {
      return NextResponse.json(
        { error: 'Document or image data is required for OCR / text extraction.' },
        { status: 400 }
      )
    }

    // Limit maximum base64 payload size (~10MB base64 = ~7.5MB file)
    if (imageBase64.length > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size exceeds the maximum limit of 5 MB.' },
        { status: 400 }
      )
    }

    // Normalize MIME type from file extension or provided header
    let normalizedMime = mimeType.toLowerCase().trim()
    if (fileName && fileName.toLowerCase().endsWith('.pdf')) {
      normalizedMime = 'application/pdf'
    } else if (normalizedMime === 'image/jpg') {
      normalizedMime = 'image/jpeg'
    }

    if (!ALLOWED_MIME_TYPES.includes(normalizedMime)) {
      return NextResponse.json(
        {
          error: `Unsupported file type "${mimeType}". Supported formats: PDF, JPEG, PNG, WEBP, and GIF.`,
        },
        { status: 415 }
      )
    }

    const sanitizedFileName = fileName ? sanitizePromptText(fileName, 100) : undefined

    const isPlaceholder = (key?: string) =>
      !key ||
      key.trim() === '' ||
      key.toUpperCase().includes('YOUR_') ||
      key === 'placeholder' ||
      key === 'test'

    const geminiKey = isPlaceholder(process.env.GEMINI_API_KEY) ? undefined : process.env.GEMINI_API_KEY
    const openAiKey = isPlaceholder(process.env.OPENAI_API_KEY) ? undefined : process.env.OPENAI_API_KEY

    // =========================================================================
    // BRANCH A: PDF Processing (Text-based & Scanned)
    // =========================================================================
    if (normalizedMime === 'application/pdf') {
      let uint8: Uint8Array
      try {
        const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '')
        const buffer = Buffer.from(cleanBase64, 'base64')
        uint8 = new Uint8Array(buffer)
      } catch (e) {
        return NextResponse.json(
          { error: 'Failed to decode base64 PDF document data.' },
          { status: 400 }
        )
      }

      if (uint8.length === 0) {
        return NextResponse.json(
          { error: 'The uploaded PDF is empty (0 bytes).' },
          { status: 400 }
        )
      }

      let pdfResult: { totalPages: number; text: string[] }
      try {
        pdfResult = await extractText(uint8, { mergePages: false })
      } catch (err: any) {
        const errMsg = String(err?.message || '').toLowerCase()
        const errName = String(err?.name || '')
        if (
          errName === 'PasswordException' ||
          errMsg.includes('password') ||
          errMsg.includes('encrypted')
        ) {
          return NextResponse.json(
            {
              error:
                'The uploaded PDF is password-protected or encrypted. Please provide an unencrypted document.',
            },
            { status: 422 }
          )
        }
        if (
          errName === 'InvalidPDFException' ||
          errMsg.includes('structure') ||
          errMsg.includes('format')
        ) {
          return NextResponse.json(
            {
              error:
                'The uploaded file is not a valid PDF or has a corrupted file structure.',
            },
            { status: 400 }
          )
        }
        return NextResponse.json(
          { error: `PDF parsing failed: ${err?.message || 'Unknown error'}` },
          { status: 400 }
        )
      }

      const totalPages = pdfResult.totalPages || 0
      if (totalPages === 0) {
        return NextResponse.json(
          { error: 'The uploaded PDF does not contain any pages.' },
          { status: 400 }
        )
      }

      // Format page-by-page text
      const pageTexts = (pdfResult.text || []).map((t, i) => {
        const trimmed = (t || '').trim()
        return {
          page: i + 1,
          text: trimmed,
        }
      })

      // Combine text with clear page markers
      const formattedPages = pageTexts
        .filter((p) => p.text.length > 0)
        .map((p) => (totalPages > 1 ? `--- Page ${p.page} ---\n${p.text}` : p.text))
        .join('\n\n')

      const combinedText = formattedPages.trim()

      // 1. Text-based PDF: Digital text was successfully extracted!
      if (combinedText.length >= 15) {
        // If AI is configured, extract structured topics
        if (geminiKey || openAiKey) {
          const aiResult = await extractTopicsWithAI(combinedText, language, geminiKey, openAiKey)
          return NextResponse.json({
            extractedText: combinedText,
            text: combinedText,
            fileName: sanitizedFileName,
            totalPages,
            topics: aiResult.topics,
            provider: aiResult.provider || 'pdf-parser',
            aiAnalyzed: aiResult.topics.length > 0,
            diagnostics:
              aiResult.topics.length > 0
                ? undefined
                : `Document text extracted from ${totalPages} page(s). AI topic extraction did not identify distinct concepts.`,
          })
        }

        // AI is not configured: return extracted text with clean diagnostic
        return NextResponse.json({
          extractedText: combinedText,
          text: combinedText,
          fileName: sanitizedFileName,
          totalPages,
          topics: [],
          provider: 'pdf-parser',
          aiAnalyzed: false,
          diagnostics: `Text extracted from ${totalPages} page(s). Configure GEMINI_API_KEY in .env.local to enable automated key topics extraction and AI summaries.`,
        })
      }

      // 2. Scanned PDF: Digital text is empty / blank -> Contains rasterized images only
      if (geminiKey) {
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(
            geminiKey
          )}`
          const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '')
          const targetLanguage = LANGUAGE_NAMES[language] || 'English'

          const response = await fetchWithTimeout(
            geminiUrl,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                system_instruction: {
                  parts: [
                    {
                      text: `You are StudyMate AI OCR assistant. This document is a scanned PDF without selectable digital text.
1. Perform visual OCR to extract all questions, headings, equations, and main text visible on the pages.
2. Identify between 3 and 6 important study topics covered in the scanned pages, with a brief explanation and page number.
Respond in ${targetLanguage}.
Return strictly a JSON object with:
"extractedText": string containing all transcribed text,
"topics": array of objects with "topic", "explanation", "pageNumber".`,
                    },
                  ],
                },
                contents: [
                  {
                    role: 'user',
                    parts: [
                      {
                        text: 'Transcribe this scanned study document and extract the important topics.',
                      },
                      {
                        inline_data: {
                          mime_type: 'application/pdf',
                          data: cleanBase64,
                        },
                      },
                    ],
                  },
                ],
                generationConfig: {
                  temperature: 0.1,
                  responseMimeType: 'application/json',
                  maxOutputTokens: 2000,
                },
              }),
            },
            25000
          )

          if (!response.ok) {
            const errText = await response.text()
            console.error('[StudyMate OCR API] Gemini scanned PDF error:', response.status, errText)
            return NextResponse.json(
              { error: `OCR service returned status ${response.status} on scanned PDF.` },
              { status: 502 }
            )
          }

          const data = await response.json()
          const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
          let extractedText = ''
          let topics: ExtractedTopic[] = []

          if (rawJson) {
            try {
              const parsed = JSON.parse(rawJson)
              extractedText = parsed.extractedText || ''
              if (Array.isArray(parsed.topics)) {
                topics = parsed.topics.map((t: any) => ({
                  topic: String(t.topic || '').trim(),
                  explanation: String(t.explanation || '').trim(),
                  pageNumber: typeof t.pageNumber === 'number' ? t.pageNumber : undefined,
                }))
              }
            } catch {
              extractedText = rawJson
            }
          }

          return NextResponse.json({
            extractedText,
            text: extractedText,
            fileName: sanitizedFileName,
            totalPages,
            topics,
            provider: 'gemini',
            aiAnalyzed: true,
          })
        } catch (err: any) {
          if (err?.name === 'AbortError') {
            return NextResponse.json(
              { error: 'Scanned PDF OCR timed out (25s limit reached).' },
              { status: 504 }
            )
          }
          return NextResponse.json(
            { error: `Scanned PDF OCR failed: ${err.message}` },
            { status: 502 }
          )
        }
      }

      // Scanned PDF and no Gemini key
      return NextResponse.json(
        {
          configured: false,
          error:
            'This PDF contains scanned images or photos without selectable digital text. Optical Character Recognition (OCR) for scanned PDFs requires GEMINI_API_KEY. Configure GEMINI_API_KEY in server-side .env.local, or upload a digital text-based PDF.',
        },
        { status: 503 }
      )
    }

    // =========================================================================
    // BRANCH B: Image Processing (JPEG, PNG, WebP, GIF)
    // =========================================================================
    if (geminiKey) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(
          geminiKey
        )}`
        const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '')
        const targetLanguage = LANGUAGE_NAMES[language] || 'English'

        const response = await fetchWithTimeout(
          geminiUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: {
                parts: [
                  {
                    text: `You are StudyMate AI OCR assistant.
1. Extract all questions, equations, headings, and legible text from this image or photo.
2. If this image covers study material, identify up to 3 core topics with brief explanation.
Respond in ${targetLanguage}.
Return strictly a JSON object with:
"extractedText": string containing transcribed text,
"topics": array of objects with "topic", "explanation".`,
                  },
                ],
              },
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: 'Transcribe this study image and extract topics.',
                    },
                    {
                      inline_data: {
                        mime_type: normalizedMime,
                        data: cleanBase64,
                      },
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json',
                maxOutputTokens: 1200,
              },
            }),
          },
          25000
        )

        if (!response.ok) {
          const errText = await response.text()
          console.error('[StudyMate OCR API] Gemini image error:', response.status, errText)
          return NextResponse.json(
            { error: `OCR service returned status ${response.status}.` },
            { status: 502 }
          )
        }

        const data = await response.json()
        const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        let extractedText = ''
        let topics: ExtractedTopic[] = []

        if (rawJson) {
          try {
            const parsed = JSON.parse(rawJson)
            extractedText = parsed.extractedText || ''
            if (Array.isArray(parsed.topics)) {
              topics = parsed.topics.map((t: any) => ({
                topic: String(t.topic || '').trim(),
                explanation: String(t.explanation || '').trim(),
              }))
            }
          } catch {
            extractedText = rawJson
          }
        }

        return NextResponse.json({
          extractedText,
          text: extractedText,
          fileName: sanitizedFileName,
          topics,
          provider: 'gemini',
          aiAnalyzed: true,
        })
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return NextResponse.json(
            { error: 'OCR request timed out (25s limit reached).' },
            { status: 504 }
          )
        }
        return NextResponse.json(
          { error: `OCR extraction failed: ${err.message}` },
          { status: 502 }
        )
      }
    }

    // No OCR provider configured for visual photo OCR
    return NextResponse.json(
      {
        configured: false,
        error:
          'No OCR provider is configured. To enable visual OCR from photos or whiteboard images, configure GEMINI_API_KEY in .env.local. You can also upload a text-based PDF or type/paste questions directly.',
      },
      { status: 503 }
    )
  } catch (error: any) {
    console.error('[StudyMate OCR API] Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected server error occurred during OCR processing.' },
      { status: 500 }
    )
  }
}

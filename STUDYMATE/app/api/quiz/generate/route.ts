import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import {
  validateContentType,
  authenticateApiRequest,
  checkRateLimit,
  fetchWithTimeout,
  sanitizePromptText,
} from '@/lib/api-security'
import { createClient } from '@/lib/supabase/server'
import {
  generateStructuralQuestionsFromNotes,
  QuizQuestionItem,
  NoteSectionInput,
} from '@/lib/quiz-generator'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export type { QuizQuestionItem, NoteSectionInput }

interface QuizGenerateRequestBody {
  materialId?: string
  materialName?: string
  topic?: string
  notesContext?: string
  notesSections?: NoteSectionInput[]
  materialContent?: string
  language?: string
  questionCount?: number | string
  difficulty?: string
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ml: 'Malayalam (മലയാളം)',
  hi: 'Hindi (हिन्दी)',
  ta: 'Tamil (தமிழ்)',
}

type AiErrorCategory =
  | 'MISSING_CONFIG'
  | 'INVALID_KEY'
  | 'QUOTA_EXCEEDED'
  | 'SERVICE_UNAVAILABLE'
  | 'MALFORMED_RESPONSE'
  | 'NETWORK_ERROR'

interface AiErrorInfo {
  category: AiErrorCategory
  status?: number
  message: string
}

function isPlaceholderKey(key?: string): boolean {
  if (!key) return true
  const trimmed = key.trim()
  if (trimmed.length < 15) return true
  const lower = trimmed.toLowerCase()
  return (
    lower.includes('your_') ||
    lower.includes('your-') ||
    lower === 'placeholder' ||
    lower === 'test' ||
    lower.includes('your_api_key') ||
    lower.includes('your-api-key')
  )
}

/**
 * Safely resolves an API key from process.env with fallback to .env.local on disk
 * without exposing or printing the secret value.
 */
function resolveServerApiKey(name: string): string | undefined {
  const envVal = process.env[name]
  if (envVal && !isPlaceholderKey(envVal)) {
    return envVal
  }

  // Fallback: check .env.local files in project root or supabase directory
  try {
    const candidatePaths = [
      path.join(process.cwd(), '.env.local'),
      path.join(process.cwd(), 'supabase', '.env.local'),
    ]
    for (const filePath of candidatePaths) {
      if (fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
        const fileContent = fs.readFileSync(/*turbopackIgnore: true*/ filePath, 'utf8')
        const lines = fileContent.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith(`${name}=`)) {
            const rawVal = trimmed.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '')
            if (rawVal && !isPlaceholderKey(rawVal)) {
              return rawVal
            }
          }
        }
      }
    }
  } catch {
    // Non-fatal filesystem access error ignored
  }

  return undefined
}

export async function POST(req: NextRequest) {
  // 1. Content-Type Validation
  const ctCheck = validateContentType(req)
  if (!ctCheck.valid && ctCheck.errorResponse) {
    return ctCheck.errorResponse
  }

  // 2. IP-Level Rate Limiting
  const ipRateLimit = checkRateLimit(req, null, 60, 60 * 1000)
  if (ipRateLimit.limited && ipRateLimit.response) {
    return ipRateLimit.response
  }

  // 3. User Authentication Requirement
  const auth = await authenticateApiRequest(req)
  if (!auth.user && auth.errorResponse) {
    return auth.errorResponse
  }

  // 4. Authenticated Rate Limiting (30 requests/minute)
  const rateLimit = checkRateLimit(req, auth.user?.id, 30, 60 * 1000)
  if (rateLimit.limited && rateLimit.response) {
    return rateLimit.response
  }

  try {
    const body: QuizGenerateRequestBody = await req.json()
    const {
      materialId,
      materialName,
      topic = 'General Study',
      notesContext = '',
      notesSections = [],
      materialContent = '',
      language = 'en',
      questionCount = 5,
      difficulty = 'Simple',
    } = body

    // 5. Material Ownership Validation & Server-Side Notes Retrieval
    let activeTopic = topic || materialName || 'General Study'
    let activeNotesContext = notesContext || ''
    let activeSections: NoteSectionInput[] = Array.isArray(notesSections) ? [...notesSections] : []

    if (materialId && typeof materialId === 'string' && materialId.trim().length > 0) {
      const cleanMatId = materialId.trim()
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanMatId)
      if (isUuid && auth.user?.id) {
        const supabase = await createClient()

        // Verify material ownership
        const { data: material, error: matErr } = await supabase
          .from('materials')
          .select('id, name, user_id')
          .eq('id', cleanMatId)
          .maybeSingle()

        if (matErr) {
          console.error('[StudyMate Quiz API] Material lookup query failed:', matErr.message)
          return NextResponse.json(
            { error: 'Failed to verify study material ownership.' },
            { status: 500 }
          )
        }

        if (!material) {
          return NextResponse.json(
            { error: 'Study material not found.' },
            { status: 404 }
          )
        }

        // Strict ownership check: Reject if material belongs to a different user
        if (material.user_id !== auth.user.id) {
          return NextResponse.json(
            { error: 'Forbidden: You do not have permission to access the requested study material.' },
            { status: 403 }
          )
        }

        if (material.name) {
          activeTopic = material.name
        }

        // Retrieve verified study notes server-side
        const { data: dbNotes } = await supabase
          .from('study_notes')
          .select('id, title, summary, sections')
          .eq('material_id', cleanMatId)
          .eq('user_id', auth.user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (dbNotes) {
          if (dbNotes.summary) {
            activeNotesContext = dbNotes.summary
          }
          if (Array.isArray(dbNotes.sections) && dbNotes.sections.length > 0) {
            activeSections = dbNotes.sections as unknown as NoteSectionInput[]
          }
        }
      }
    }

    // Parse and clamp target question count
    let countNum = 5
    if (typeof questionCount === 'number') {
      countNum = questionCount
    } else if (typeof questionCount === 'string') {
      const match = questionCount.match(/\d+/)
      countNum = match ? parseInt(match[0], 10) : 5
    }
    countNum = Math.min(20, Math.max(3, countNum))

    const sanitizedTopic = sanitizePromptText(activeTopic, 150)
    const targetLanguage = ['en', 'ml', 'hi', 'ta'].includes(language) ? language : 'en'
    const languageName = LANGUAGE_NAMES[targetLanguage] || 'English'

    // Compile active curriculum context
    let compiledContext = ''
    if (activeSections.length > 0) {
      compiledContext = activeSections
        .map((s) => {
          const bulletsText = s.bullets?.length ? `\n• ${s.bullets.join('\n• ')}` : ''
          const tipText = s.examTip ? `\nExam Tip: ${s.examTip}` : ''
          return `Concept: ${s.title}\nDetails: ${s.content}${bulletsText}${tipText}`
        })
        .join('\n\n')
    }

    if (activeNotesContext && activeNotesContext.trim().length > 0) {
      compiledContext += `\n\nAdditional Notes Summary:\n${activeNotesContext.trim()}`
    }

    if (materialContent && materialContent.trim().length > 0) {
      compiledContext += `\n\nDocument Outline:\n${materialContent.trim()}`
    }

    const sanitizedContext = sanitizePromptText(compiledContext, 6000)

    // Guard: ensure student provided at least some notes or topic
    if (!sanitizedContext && !sanitizedTopic) {
      return NextResponse.json(
        {
          error: 'Cannot generate quiz: No study notes or document topic were provided.',
        },
        { status: 400 }
      )
    }

    // Resolve server-side AI provider keys
    const geminiKey = resolveServerApiKey('GEMINI_API_KEY')
    const openAiKey = resolveServerApiKey('OPENAI_API_KEY')

    let geminiError: AiErrorInfo | null = null

    // =========================================================================
    // OPTION 1: Real AI Generation with Google Gemini
    // =========================================================================
    if (geminiKey) {
      try {
        const systemPrompt = `You are StudyMate AI, an expert academic quiz generator and pedagogical assessment designer.
Generate exactly ${countNum} high-quality, conceptual multiple-choice questions grounded in the provided study material.
Target Language: Generate all questions, options, and explanations strictly in ${languageName}.
Target Topic: ${sanitizedTopic}
Difficulty: ${difficulty}

CRITICAL RULES:
1. Every question must be strictly relevant to the document material provided below. Do not generate generic questions about unrelated subjects.
2. Provide exactly 4 options per question. Exactly one option must be correct.
3. The "answer" field must be the 0-indexed integer (0, 1, 2, or 3) pointing to the correct option in the options array.
4. Provide a clear, educational "explanation" clarifying why the answer is correct and why other options are incorrect.
5. Return strictly a JSON array of objects adhering to this schema:
[
  {
    "question": "Question text in ${languageName}",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "answer": 0,
    "explanation": "Clear explanation in ${languageName}",
    "topic": "Concept name"
  }
]`

        const userPrompt = `Study Material Context for "${sanitizedTopic}":\n${sanitizedContext || sanitizedTopic}`

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(
          geminiKey
        )}`

        const response = await fetchWithTimeout(
          geminiUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
              generationConfig: {
                temperature: 0.3,
                responseMimeType: 'application/json',
                maxOutputTokens: 2500,
              },
            }),
          },
          25000
        )

        if (response.ok) {
          const data = await response.json()
          const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
          if (rawText) {
            try {
              const parsed = JSON.parse(rawText)
              const list = Array.isArray(parsed) ? parsed : parsed.questions || parsed.items || []
              if (Array.isArray(list) && list.length > 0) {
                const validQuestions: QuizQuestionItem[] = list
                  .filter(
                    (q: any) =>
                      q &&
                      typeof q.question === 'string' &&
                      Array.isArray(q.options) &&
                      q.options.length === 4 &&
                      typeof q.answer === 'number' &&
                      q.answer >= 0 &&
                      q.answer < 4
                  )
                  .map((q: any) => ({
                    question: String(q.question).trim(),
                    options: q.options.map((o: any) => String(o).trim()),
                    answer: Math.floor(q.answer),
                    explanation: String(q.explanation || 'Verified correct answer according to course notes.').trim(),
                    topic: String(q.topic || sanitizedTopic).trim(),
                  }))

                if (validQuestions.length > 0) {
                  return NextResponse.json({
                    questions: validQuestions.slice(0, countNum),
                    provider: 'gemini',
                    aiGenerated: true,
                    topic: sanitizedTopic,
                    language: targetLanguage,
                    count: validQuestions.length,
                  })
                }
              }
            } catch {
              geminiError = {
                category: 'MALFORMED_RESPONSE',
                status: 200,
                message: 'Gemini responded but output could not be parsed as valid JSON questions.',
              }
              console.warn('[StudyMate Quiz API] Gemini response parsing failed [status: 200, category: MALFORMED_RESPONSE]')
            }
          } else {
            geminiError = {
              category: 'MALFORMED_RESPONSE',
              status: 200,
              message: 'Gemini returned an empty candidate response.',
            }
            console.warn('[StudyMate Quiz API] Gemini empty candidate [status: 200, category: MALFORMED_RESPONSE]')
          }
        } else {
          // Categorize HTTP failure status
          const status = response.status
          if (status === 400 || status === 401 || status === 403) {
            geminiError = {
              category: 'INVALID_KEY',
              status,
              message: `Gemini API key is invalid or lacks required permissions (HTTP ${status}).`,
            }
            console.warn(`[StudyMate Quiz API] Gemini key rejected [status: ${status}, category: INVALID_KEY]`)
          } else if (status === 429) {
            geminiError = {
              category: 'QUOTA_EXCEEDED',
              status: 429,
              message: 'Gemini API quota or rate limit exceeded (HTTP 429).',
            }
            console.warn('[StudyMate Quiz API] Gemini quota exceeded [status: 429, category: QUOTA_EXCEEDED]')
          } else {
            geminiError = {
              category: 'SERVICE_UNAVAILABLE',
              status,
              message: `Gemini API service error (HTTP ${status}).`,
            }
            console.warn(`[StudyMate Quiz API] Gemini service error [status: ${status}, category: SERVICE_UNAVAILABLE]`)
          }
        }
      } catch (err: any) {
        geminiError = {
          category: 'NETWORK_ERROR',
          message: 'Network request to Google Gemini API timed out or failed.',
        }
        console.warn('[StudyMate Quiz API] Gemini network failure [category: NETWORK_ERROR]')
      }
    } else {
      geminiError = {
        category: 'MISSING_CONFIG',
        message: 'GEMINI_API_KEY is not configured or is set to placeholder in .env.local.',
      }
    }

    // =========================================================================
    // OPTION 2: Real AI Generation with OpenAI (Backup)
    // =========================================================================
    if (openAiKey) {
      try {
        const systemPrompt = `You are StudyMate AI, an expert academic quiz generator.
Generate exactly ${countNum} high-quality conceptual multiple-choice questions grounded in the provided study material.
Target Language: Generate all questions, options, and explanations in ${languageName}.
Target Topic: ${sanitizedTopic}
Difficulty: ${difficulty}

Return strictly a JSON object with a "questions" array adhering to:
{
  "questions": [
    {
      "question": "Question text in ${languageName}",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": 0,
      "explanation": "Clear explanation in ${languageName}",
      "topic": "Concept name"
    }
  ]
}`

        const response = await fetchWithTimeout(
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
                { role: 'user', content: sanitizedContext || sanitizedTopic },
              ],
              temperature: 0.3,
              max_tokens: 2500,
              response_format: { type: 'json_object' },
            }),
          },
          25000
        )

        if (response.ok) {
          const data = await response.json()
          const content = data?.choices?.[0]?.message?.content?.trim()
          if (content) {
            const parsed = JSON.parse(content)
            const list = Array.isArray(parsed) ? parsed : parsed.questions || parsed.items || []
            if (Array.isArray(list) && list.length > 0) {
              const validQuestions: QuizQuestionItem[] = list
                .filter(
                  (q: any) =>
                    q &&
                    typeof q.question === 'string' &&
                    Array.isArray(q.options) &&
                    q.options.length === 4 &&
                    typeof q.answer === 'number' &&
                    q.answer >= 0 &&
                    q.answer < 4
                )
                .map((q: any) => ({
                  question: String(q.question).trim(),
                  options: q.options.map((o: any) => String(o).trim()),
                  answer: Math.floor(q.answer),
                  explanation: String(q.explanation || 'Verified correct answer according to course notes.').trim(),
                  topic: String(q.topic || sanitizedTopic).trim(),
                }))

              if (validQuestions.length > 0) {
                return NextResponse.json({
                  questions: validQuestions.slice(0, countNum),
                  provider: 'openai',
                  aiGenerated: true,
                  topic: sanitizedTopic,
                  language: targetLanguage,
                  count: validQuestions.length,
                })
              }
            }
          }
        }
      } catch (openAiErr) {
        console.warn('[StudyMate Quiz API] OpenAI generation failed, falling back:', openAiErr)
      }
    }

    // =========================================================================
    // OPTION 3: Curriculum Structural Fallback (Deterministic, Grounded)
    // =========================================================================
    const structuralQuestions = generateStructuralQuestionsFromNotes(
      activeSections,
      sanitizedTopic,
      countNum,
      activeNotesContext
    )

    if (structuralQuestions.length > 0) {
      return NextResponse.json({
        questions: structuralQuestions,
        provider: 'structural-parser',
        aiGenerated: false,
        topic: sanitizedTopic,
        language: targetLanguage,
        count: structuralQuestions.length,
        diagnostics: geminiError?.message
          ? `Grounded synthesis used: ${geminiError.message}`
          : 'Questions generated directly from study note sections and concepts.',
      })
    }

    // =========================================================================
    // Clear, Differentiated Error Reporting
    // =========================================================================
    let userFacingError = ''
    if (geminiError?.category === 'INVALID_KEY') {
      userFacingError = `Gemini AI key error: The configured GEMINI_API_KEY was rejected by Google (HTTP ${geminiError.status || 400}). Please verify your API key in .env.local.`
    } else if (geminiError?.category === 'QUOTA_EXCEEDED') {
      userFacingError = `Gemini AI quota exceeded: Google AI Studio rate limit or quota reached (HTTP 429). Please wait a moment or check your quota.`
    } else if (geminiError?.category === 'MALFORMED_RESPONSE') {
      userFacingError = `Gemini AI responded with an unparseable format. Please try again with a different topic or question count.`
    } else if (geminiError?.category === 'SERVICE_UNAVAILABLE') {
      userFacingError = `Gemini AI service is temporarily unavailable (HTTP ${geminiError.status || 503}). Please try again shortly.`
    } else if (geminiError?.category === 'NETWORK_ERROR') {
      userFacingError = `Network connection to Gemini AI timed out. Please check your internet connection and try again.`
    } else {
      userFacingError = `AI provider not configured: GEMINI_API_KEY is missing or set to placeholder in .env.local. Offline question synthesis requires study notes with at least 4 distinct concepts.`
    }

    return NextResponse.json(
      {
        configured: Boolean(geminiKey || openAiKey),
        errorCategory: geminiError?.category || 'MISSING_CONFIG',
        error: userFacingError,
      },
      { status: 422 }
    )
  } catch (error: any) {
    console.error('[StudyMate Quiz API] Unexpected error in quiz route:', error?.message)
    return NextResponse.json(
      { error: 'An unexpected server error occurred while generating the quiz.' },
      { status: 500 }
    )
  }
}

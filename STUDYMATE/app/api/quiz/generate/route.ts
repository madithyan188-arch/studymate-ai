import { NextRequest, NextResponse } from 'next/server'
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

    // Check for AI provider keys
    const isPlaceholder = (key?: string) =>
      !key ||
      key.trim() === '' ||
      key.toUpperCase().includes('YOUR_') ||
      key === 'placeholder' ||
      key === 'test'

    const geminiKey = isPlaceholder(process.env.GEMINI_API_KEY) ? undefined : process.env.GEMINI_API_KEY
    const openAiKey = isPlaceholder(process.env.OPENAI_API_KEY) ? undefined : process.env.OPENAI_API_KEY

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
          }
        }
      } catch (geminiErr) {
        console.warn('[StudyMate Quiz API] Gemini generation failed, falling back:', geminiErr)
      }
    }

    // =========================================================================
    // OPTION 2: Real AI Generation with OpenAI
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
        diagnostics:
          'Questions generated directly from study note sections and concepts. Configure GEMINI_API_KEY in server settings for AI synthesis.',
      })
    }

    // If no questions could be extracted and no AI key is configured
    return NextResponse.json(
      {
        configured: Boolean(geminiKey || openAiKey),
        error:
          'Could not generate quiz questions from the provided content without AI. The material contains insufficient distinct concepts to form non-misleading multiple choice questions. Please provide notes with at least 4 distinct concepts or configure GEMINI_API_KEY in server settings.',
      },
      { status: 422 }
    )
  } catch (error: any) {
    console.error('[StudyMate Quiz API] Unexpected error in quiz route:', error)
    return NextResponse.json(
      { error: 'An unexpected server error occurred while generating the quiz.' },
      { status: 500 }
    )
  }
}

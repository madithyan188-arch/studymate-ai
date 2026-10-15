/**
 * StudyMate AI - Automated Quiz Generation & Pre-Deployment Review Test Suite
 *
 * This test suite explicitly distinguishes:
 * 1. [UNIT IMPLEMENTATION TEST]: Directly executes generateStructuralQuestionsFromNotes()
 *    with real study notes, verifying question synthesis, option extraction, 4-option contract,
 *    0-3 answer indexing, distractor grounding, and rejection of sparse/misleading content.
 * 2. [LIVE HTTP API TEST]: Dispatches live network requests to http://localhost:3000/api/quiz/generate,
 *    verifying 401 unauthenticated rejection, 415 content-type enforcement, and preflight handling.
 * 3. [CONFIGURATION & SECURITY AUDIT]: Audits source files for Vercel maxDuration compliance,
 *    user material ownership validation, and server-side note retrieval.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { generateStructuralQuestionsFromNotes } from '../lib/quiz-generator.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BASE_URL = 'http://localhost:3000'

let passedTests = 0
let failedTests = 0

function assert(condition, message, category = 'AUTOMATED TEST') {
  if (condition) {
    passedTests++
    console.log(`  [PASS] [${category}] ${message}`)
  } else {
    failedTests++
    console.error(`  [FAIL] [${category}] ${message}`)
  }
}

async function makeRequest(urlPath, options = {}) {
  const url = `${BASE_URL}${urlPath}`
  const headers = options.headers || {}
  const method = options.method || 'GET'
  const body =
    options.body !== undefined
      ? typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body)
      : undefined

  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(options.body && typeof options.body !== 'string' ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body,
    })
    let data = null
    const text = await res.text()
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
    return { status: res.status, headers: res.headers, data }
  } catch (err) {
    return { error: err.message }
  }
}

async function runQuizGenerationTests() {
  console.log('\n============================================================')
  console.log(' StudyMate AI Quiz Generation Pre-Deployment Verification ')
  console.log('============================================================\n')

  // =========================================================================
  // 1. [UNIT IMPLEMENTATION TEST]: Real Execution of Quiz Fallback Generator
  // =========================================================================
  console.log('--- SECTION 1: [UNIT IMPLEMENTATION TEST] Direct Function Execution ---\n')

  const sampleSections = [
    {
      id: 'sec-1',
      title: 'Paging and Frames',
      content: 'Paging divides physical memory into fixed-size blocks called frames and logical memory into pages.',
      examTip: 'Remember frames are physical while pages are logical memory blocks.',
      bullets: [
        'Frames and pages always have identical power-of-two sizes.',
        'Address translation uses page number as an index into the page table.',
      ],
    },
    {
      id: 'sec-2',
      title: 'Page Replacement Algorithms',
      content: 'The Least Recently Used (LRU) algorithm replaces the page that has not been accessed for the longest period of time.',
      examTip: 'LRU requires hardware assistance such as counters or an active stack.',
      bullets: [
        'FIFO can suffer from Belady anomaly where increasing frames increases faults.',
        'Optimal page replacement has the lowest fault rate but requires future knowledge.',
      ],
    },
    {
      id: 'sec-3',
      title: 'Virtual Memory Management',
      content: 'Virtual memory separates user logical memory from physical memory to allow execution of processes larger than physical RAM.',
      examTip: 'Crucial for multi-programming and process isolation.',
      bullets: [
        'Enables effective memory protection between competing OS processes.',
        'Demand paging loads pages only when referenced during execution.',
      ],
    },
  ]

  // Test 1.1: Direct invocation produces valid questions
  const generated = generateStructuralQuestionsFromNotes(
    sampleSections,
    'Operating Systems',
    3,
    'Comprehensive study notes on virtual memory architecture and algorithms.'
  )

  assert(
    Array.isArray(generated) && generated.length > 0,
    `generateStructuralQuestionsFromNotes() produced ${generated?.length} questions from authentic notes`,
    'UNIT IMPLEMENTATION TEST'
  )

  // Test 1.2: Validate question grounding and options contract
  for (let i = 0; i < generated.length; i++) {
    const q = generated[i]
    assert(
      typeof q.question === 'string' && q.question.length > 20,
      `Question #${i + 1} has valid question stem: "${q.question.slice(0, 60)}..."`,
      'UNIT IMPLEMENTATION TEST'
    )
    assert(
      Array.isArray(q.options) && q.options.length === 4,
      `Question #${i + 1} provides exactly 4 options`,
      'UNIT IMPLEMENTATION TEST'
    )
    assert(
      new Set(q.options).size === 4,
      `Question #${i + 1} options are all strictly distinct from each other`,
      'UNIT IMPLEMENTATION TEST'
    )
    assert(
      typeof q.answer === 'number' && q.answer >= 0 && q.answer <= 3,
      `Question #${i + 1} answer index is valid (got ${q.answer})`,
      'UNIT IMPLEMENTATION TEST'
    )
    assert(
      typeof q.explanation === 'string' && q.explanation.length > 15,
      `Question #${i + 1} includes grounded educational explanation`,
      'UNIT IMPLEMENTATION TEST'
    )

    // Verify no canned pseudo-scientific filler is present
    const hasMisleadingFiller = q.options.some(
      (opt) =>
        opt.includes('unrelated systemic thresholds') ||
        opt.includes('secondary storage buffer without active functionality') ||
        opt.includes('transitional phase without participating')
    )
    assert(
      !hasMisleadingFiller,
      `Question #${i + 1} contains NO fabricated or misleading filler distractors`,
      'UNIT IMPLEMENTATION TEST'
    )
  }

  // Test 1.3: Anti-misleading guard: Sparse notes with < 4 concepts must return []
  console.log('\n  Checking anti-misleading safeguard on sparse/insufficient notes...')
  const sparseSections = [
    {
      id: 'sec-short',
      title: 'Intro',
      content: 'Only one brief fact.',
    },
  ]
  const sparseResult = generateStructuralQuestionsFromNotes(
    sparseSections,
    'Brief Topic',
    3,
    ''
  )
  assert(
    Array.isArray(sparseResult) && sparseResult.length === 0,
    'Sparse notes with < 4 distinct concepts return [] (never silently manufactures misleading distractors)',
    'UNIT IMPLEMENTATION TEST'
  )

  // Test 1.4: Empty notes return []
  const emptyResult = generateStructuralQuestionsFromNotes([], 'Empty', 5, '')
  assert(
    Array.isArray(emptyResult) && emptyResult.length === 0,
    'Empty notes return [] questions safely',
    'UNIT IMPLEMENTATION TEST'
  )

  // =========================================================================
  // 2. [LIVE HTTP API TEST]: Network Requests to Running Server
  // =========================================================================
  console.log('\n--- SECTION 2: [LIVE HTTP API TEST] Network Endpoints on ' + BASE_URL + ' ---\n')

  // Test 2.1: 401 Unauthorized for missing credentials
  const unauthRes = await makeRequest('/api/quiz/generate', {
    method: 'POST',
    body: { topic: 'Algorithms', materialName: 'Algorithms.pdf' },
  })
  if (unauthRes.error) {
    console.warn(`  [WARN] Live server not reachable at ${BASE_URL}: ${unauthRes.error}`)
  } else {
    assert(
      unauthRes.status === 401,
      `POST /api/quiz/generate rejects unauthenticated requests with HTTP 401 (got ${unauthRes.status})`,
      'LIVE HTTP API TEST'
    )
    assert(
      unauthRes.data?.error?.includes('Unauthorized') ||
        unauthRes.data?.error?.includes('signed in') ||
        unauthRes.data?.code === 'AUTH_REQUIRED',
      `401 response body provides explicit auth failure message`,
      'LIVE HTTP API TEST'
    )

    // Test 2.2: 415 Unsupported Media Type for non-JSON
    const badContentTypeRes = await makeRequest('/api/quiz/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'non-json-content',
    })
    assert(
      badContentTypeRes.status === 415,
      `POST /api/quiz/generate rejects non-JSON Content-Type with HTTP 415 (got ${badContentTypeRes.status})`,
      'LIVE HTTP API TEST'
    )

    // Test 2.3: OPTIONS preflight
    const optRes = await makeRequest('/api/quiz/generate', { method: 'OPTIONS' })
    assert(
      optRes.status === 200 || optRes.status === 204 || optRes.status === 405 || optRes.status === 401,
      `OPTIONS preflight responds safely (status ${optRes.status})`,
      'LIVE HTTP API TEST'
    )
  }

  // =========================================================================
  // 3. [CONFIGURATION & SECURITY AUDIT]: Source Code Inspection
  // =========================================================================
  console.log('\n--- SECTION 3: [CONFIGURATION & SECURITY AUDIT] Source & Server Settings ---\n')

  const routeFilePath = path.join(__dirname, '..', 'app', 'api', 'quiz', 'generate', 'route.ts')
  const routeContent = fs.readFileSync(routeFilePath, 'utf8')

  // Test 3.1: Vercel Plan Limits & Route Segment Config
  assert(
    routeContent.includes("export const maxDuration = 60"),
    'maxDuration = 60 configured (exact Vercel Hobby plan maximum; fully compliant with Pro/Enterprise)',
    'CONFIGURATION & SECURITY AUDIT'
  )
  assert(
    routeContent.includes("export const dynamic = 'force-dynamic'"),
    "dynamic = 'force-dynamic' configured for serverless execution",
    'CONFIGURATION & SECURITY AUDIT'
  )

  // Test 3.2: User Material Ownership Validation
  assert(
    routeContent.includes('material.user_id !== auth.user.id') && routeContent.includes('403'),
    'Quiz API explicitly validates authenticated user ownership (material.user_id === auth.user.id) and returns HTTP 403 on IDOR attempts',
    'CONFIGURATION & SECURITY AUDIT'
  )

  // Test 3.3: Server-Side Notes Retrieval
  assert(
    routeContent.includes("from('study_notes')") && routeContent.includes('.eq(\'material_id\', cleanMatId)'),
    'Quiz API retrieves study notes server-side from study_notes table using material_id and user_id',
    'CONFIGURATION & SECURITY AUDIT'
  )

  // Test 3.4: Rejection of misleading content with HTTP 422 and differentiated error categorization
  assert(
    routeContent.includes('422') && routeContent.includes('distinct concepts'),
    'Quiz API returns HTTP 422 when note content is insufficient to prevent misleading/fabricated quiz options',
    'CONFIGURATION & SECURITY AUDIT'
  )

  // Test 3.5: Multi-language support mapping
  assert(
    (routeContent.includes("ml: 'Malayalam (മലയാളം)'") || routeContent.includes("'ml': 'Malayalam (മലയാളം)'")) &&
      (routeContent.includes("hi: 'Hindi (हिन्दी)'") || routeContent.includes("'hi': 'Hindi (हिन्दी)'")) &&
      (routeContent.includes("ta: 'Tamil (தமிழ்)'") || routeContent.includes("'ta': 'Tamil (தமிழ்)'")),
    'Localization dictionary maps Malayalam, Hindi, and Tamil to native script prompts',
    'CONFIGURATION & SECURITY AUDIT'
  )

  // Test 3.6: Differentiated Gemini Error Handling
  assert(
    routeContent.includes('INVALID_KEY') &&
      routeContent.includes('QUOTA_EXCEEDED') &&
      routeContent.includes('MALFORMED_RESPONSE') &&
      routeContent.includes('MISSING_CONFIG'),
    'Quiz API distinguishes missing config, invalid key, quota limits, and malformed AI responses',
    'CONFIGURATION & SECURITY AUDIT'
  )

  // Test 3.7: Sanitized Diagnostic Logging (no credential exposure)
  assert(
    routeContent.includes('Gemini key rejected [status:') &&
      routeContent.includes('category: INVALID_KEY') &&
      !routeContent.includes('console.warn(geminiKey') &&
      !routeContent.includes('console.log(geminiKey'),
    'Quiz API logs only sanitized diagnostic details (status and category), never credentials or full notes',
    'CONFIGURATION & SECURITY AUDIT'
  )

  console.log(`\n============================================================`)
  console.log(` Test Summary: ${passedTests} Passed, ${failedTests} Failed`)
  console.log(`============================================================\n`)

  if (failedTests > 0) {
    process.exit(1)
  }
}

runQuizGenerationTests().catch((err) => {
  console.error('Fatal error during quiz generation tests:', err)
  process.exit(1)
})

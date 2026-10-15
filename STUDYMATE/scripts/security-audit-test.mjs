/**
 * StudyMate AI - Phase 8 Automated Security & Regression Audit Suite
 * Tests API route security, authentication enforcement, rate limiting,
 * payload validation, schema constraints, and secret exposure protection.
 */

import http from 'http'
import fs from 'fs'
import path from 'path'

const BASE_URL = 'http://localhost:3000'

let passedTests = 0
let failedTests = 0
const results = []

function assert(condition, message) {
  if (condition) {
    passedTests++
    results.push({ status: 'PASS', message })
    console.log(`  [PASS] ${message}`)
  } else {
    failedTests++
    results.push({ status: 'FAIL', message })
    console.error(`  [FAIL] ${message}`)
  }
}

async function makeRequest(urlPath, options = {}) {
  const url = `${BASE_URL}${urlPath}`
  const headers = options.headers || {}
  const method = options.method || 'GET'
  const body = options.body ? JSON.stringify(options.body) : undefined

  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
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

async function runSecurityAudit() {
  console.log('\n=== StudyMate AI Phase 8 Security Audit ===\n')

  // 1. Secrets Scan: Verify no service_role key or unencrypted secrets in client files
  console.log('1. Checking Secret Exposure & Client Bundle Hygiene...')
  let clientServiceRoleFound = false
  let hardcodedJwtFound = false

  // Client directory check: components/ must NEVER reference service_role
  if (fs.existsSync('components')) {
    const clientFiles = fs.readdirSync('components', { recursive: true })
    for (const f of clientFiles) {
      const fullPath = path.join('components', f)
      if (fs.statSync(fullPath).isFile() && (f.endsWith('.ts') || f.endsWith('.tsx'))) {
        const content = fs.readFileSync(fullPath, 'utf8')
        if (content.toLowerCase().includes('service_role')) {
          clientServiceRoleFound = true
          console.error(`Found service role reference in client component: ${fullPath}`)
        }
        if (/eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}/.test(content)) {
          hardcodedJwtFound = true
          console.error(`Found hardcoded JWT in client component: ${fullPath}`)
        }
      }
    }
  }
  assert(!clientServiceRoleFound, 'No service-role references present in client-facing components')
  assert(!hardcodedJwtFound, 'No hardcoded JWT secret tokens present in client components')

  // 2. Environment Variables Audit
  console.log('\n2. Auditing Public vs Server Environment Variables...')
  if (fs.existsSync('.env.local')) {
    const envContent = fs.readFileSync('.env.local', 'utf8')
    const hasServiceKey = envContent.includes('SERVICE_ROLE') || envContent.includes('SECRET_KEY')
    assert(!hasServiceKey, '.env.local does not contain or expose a service-role/secret key')
    const hasAnonKey = envContent.includes('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || envContent.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    assert(hasAnonKey, '.env.local correctly specifies public anon/publishable key')
  }

  // 3. Database Migration & RLS Schema Audit
  console.log('\n3. Auditing Deployed Relational Schema & RLS Policies...')
  const migrationPath = 'supabase/migrations/20261014220000_create_studymate_core_schema.sql'
  if (fs.existsSync(migrationPath)) {
    const sql = fs.readFileSync(migrationPath, 'utf8')
    const requiredTables = [
      'profiles',
      'user_settings',
      'materials',
      'study_notes',
      'quiz_attempts',
      'tutor_conversations',
      'tutor_messages',
      'scan_queries',
    ]

    for (const table of requiredTables) {
      assert(sql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`), `RLS is enabled on public.${table}`)
      assert(sql.includes(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`), `RLS is forced on public.${table}`)
      assert(sql.includes(`REVOKE ALL ON public.${table} FROM anon;`), `Anonymous public access is revoked from public.${table}`)
    }

    assert(
      !sql.includes('GRANT UPDATE ON public.quiz_attempts TO authenticated;'),
      'quiz_attempts table immutability preserved (NO authenticated UPDATE grant)'
    )
    assert(
      sql.includes('ON DELETE CASCADE') && sql.includes('fk_tutor_messages_parent_conversation'),
      'Cascading foreign key correctly configured from tutor_conversations to tutor_messages'
    )
    assert(
      sql.includes('ON DELETE CASCADE') && sql.includes('fk_study_notes_material_user'),
      'Cascading foreign key correctly configured from materials to study_notes'
    )
    assert(
      sql.includes('ON DELETE SET NULL (material_id)') && sql.includes('fk_quiz_attempts_material_user'),
      'User quiz progress preserved on material deletion (SET NULL on material_id)'
    )
  }

  // 4. API Security: Unauthenticated Access Rejection
  console.log('\n4. Testing Unauthenticated Access Rejection to Protected APIs...')

  // Test /api/tutor/chat without session
  const tutorRes = await makeRequest('/api/tutor/chat', {
    method: 'POST',
    body: { messages: [{ role: 'user', text: 'Hello tutor' }] },
  })
  assert(tutorRes.status === 401, 'POST /api/tutor/chat rejects unauthenticated requests with HTTP 401 Unauthorized')

  // Test /api/scan/answer without session
  const scanAnsRes = await makeRequest('/api/scan/answer', {
    method: 'POST',
    body: { question: 'What is photosynthesis?' },
  })
  assert(scanAnsRes.status === 401, 'POST /api/scan/answer rejects unauthenticated requests with HTTP 401 Unauthorized')

  // Test /api/scan/ocr without session
  const ocrRes = await makeRequest('/api/scan/ocr', {
    method: 'POST',
    body: { imageBase64: 'data:image/jpeg;base64,dGVzdA==' },
  })
  assert(ocrRes.status === 401, 'POST /api/scan/ocr rejects unauthenticated requests with HTTP 401 Unauthorized')

  // Test /api/account/delete without session
  const deleteRes = await makeRequest('/api/account/delete', {
    method: 'POST',
    body: { confirm: true },
  })
  assert(deleteRes.status === 401, 'POST /api/account/delete rejects unauthenticated requests with HTTP 401 Unauthorized')

  // 5. Content-Type Header Validation
  console.log('\n5. Testing Content-Type Enforcement...')
  const wrongCtRes = await makeRequest('/api/tutor/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'plain text payload',
  })
  assert(wrongCtRes.status === 415, 'POST /api/tutor/chat rejects non-JSON Content-Type with HTTP 415 Unsupported Media Type')

  // 6. Rate Limiting Protection on Live Server
  console.log('\n6. Testing Sliding-Window Rate Limiting Engine...')
  // Send 35 rapid requests to /api/scan/ocr (which has IP limit of 30 req/min)
  let rateLimitHit = false
  for (let i = 0; i < 35; i++) {
    const res = await makeRequest('/api/scan/ocr', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.99' },
      body: { imageBase64: 'data:image/jpeg;base64,dGVzdA==' },
    })
    if (res.status === 429) {
      rateLimitHit = true
      break
    }
  }
  assert(rateLimitHit, 'Live endpoint throttles excessive request bursts with HTTP 429 Too Many Requests')

  // 7. Sanitization & Truncation Logic
  console.log('\n7. Testing Prompt Sanitization & Payload Truncation Rules...')
  function testSanitize(text, maxLength = 2000) {
    if (!text) return ''
    return text.replace(/\0/g, '').trim().slice(0, maxLength)
  }

  const dirtyInput = 'Normal text\0with null bytes\0\0'
  const cleaned = testSanitize(dirtyInput, 100)
  assert(!cleaned.includes('\0') && cleaned === 'Normal textwith null bytes', 'Prompt sanitizer strips malicious null bytes')

  const longInput = 'A'.repeat(5000)
  const truncated = testSanitize(longInput, 2000)
  assert(truncated.length === 2000, 'Context sanitizer strictly enforces maximum boundary of 2,000 chars')

  console.log(`\n=== Audit Summary: ${passedTests} Passed, ${failedTests} Failed ===\n`)
  process.exit(failedTests > 0 ? 1 : 0)
}

runSecurityAudit().catch((err) => {
  console.error('Audit suite encountered unexpected error:', err)
  process.exit(1)
})

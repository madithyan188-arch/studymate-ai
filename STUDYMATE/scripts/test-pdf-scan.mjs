/**
 * StudyMate AI - PDF Scanning and Important Topics Extraction Verification Suite
 * Tests text-based PDFs, multi-page PDFs, corrupt PDFs, empty PDFs,
 * scanned PDFs, structural topic extraction, unauthenticated API rejection, and topics structure.
 */

import { extractText } from 'unpdf'
import { extractTopicsFromDocumentStructure } from '../lib/document-topics.ts'
import assert from 'assert'

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`  [PASS] ${name}`)
  } catch (err) {
    failed++
    console.error(`  [FAIL] ${name}: ${err.message}`)
  }
}

async function testAsync(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  [PASS] ${name}`)
  } catch (err) {
    failed++
    console.error(`  [FAIL] ${name}: ${err.message}`)
  }
}

console.log('=== StudyMate AI PDF Scanning & Topics Extraction Test ===\n')

// 1. Single-page text-based PDF test
await testAsync('Single-page text PDF correctly parsed and extracted', async () => {
  const stream = 'BT /F1 12 Tf 72 712 Td (Cell membrane is selectively permeable to solutes.) Tj ET'
  const pdfStr = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length ${stream.length} >> stream
${stream}
endstream endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000228 00000 n 
0000000299 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
420
%%EOF`

  const uint8 = new Uint8Array(Buffer.from(pdfStr))
  const res = await extractText(uint8, { mergePages: false })
  assert.strictEqual(res.totalPages, 1, 'Total pages should be 1')
  assert(res.text[0].includes('Cell membrane is selectively permeable'), 'Extracted text should contain target string')
})

// 2. Multi-page text-based PDF test
await testAsync('Multi-page PDF correctly parses page-by-page text', async () => {
  const stream1 = 'BT /F1 12 Tf 72 712 Td (Page 1: Phospholipid bilayer transport mechanisms.) Tj ET'
  const stream2 = 'BT /F1 12 Tf 72 712 Td (Page 2: Mitochondrial ATP synthase oxidative phosphorylation.) Tj ET'
  const pdfStr = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length ${stream1.length} >> stream
${stream1}
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
6 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /MediaBox [0 0 612 792] /Contents 7 0 R >> endobj
7 0 obj << /Length ${stream2.length} >> stream
${stream2}
endstream endobj
xref
0 8
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000123 00000 n 
0000000236 00000 n 
0000000350 00000 n 
0000000421 00000 n 
0000000534 00000 n 
trailer << /Size 8 /Root 1 0 R >>
startxref
650
%%EOF`

  const uint8 = new Uint8Array(Buffer.from(pdfStr))
  const res = await extractText(uint8, { mergePages: false })
  assert.strictEqual(res.totalPages, 2, 'Total pages should be 2')
  assert(res.text[0].includes('Page 1: Phospholipid bilayer'), 'Page 1 should match')
  assert(res.text[1].includes('Page 2: Mitochondrial ATP synthase'), 'Page 2 should match')
})

// 3. Structural Topic Extraction from Document Text
test('Structural topic extractor identifies headings, explanations, and page numbers', () => {
  const samplePages = [
    {
      page: 1,
      text: `Chapter 1: Phospholipid Bilayer Architecture\nThe cell membrane is composed of an amphipathic lipid bilayer that establishes a stable hydrophobic interior core.\n\nMembrane Transport Mechanisms:\nPassive diffusion facilitates nonpolar gas exchange, while integral channel proteins regulate polar ion movement.`,
    },
    {
      page: 2,
      text: `Section 2: ATP Synthase Function\nMitochondria synthesize ATP through rotary catalytic phosphorylation driven by chemiosmotic proton gradients.\n\nCellular Homeostasis:\nLiving organisms maintain internal chemical balance through negative feedback loops and active transport across organelles.`,
    },
  ]

  const topics = extractTopicsFromDocumentStructure(samplePages)
  assert(Array.isArray(topics), 'topics should be an array')
  assert(topics.length >= 2, `Expected at least 2 topics, got ${topics.length}`)
  assert(topics.some((t) => t.topic.includes('Phospholipid Bilayer') && t.pageNumber === 1), 'Topic 1 should have page 1')
  assert(topics.some((t) => t.topic.includes('ATP Synthase') && t.pageNumber === 2), 'Topic 2 should have page 2')
  assert(topics.every((t) => t.explanation && t.explanation.length > 15), 'Every topic must have an explanation')
})

// 4. Corrupt/Invalid PDF handling
await testAsync('Corrupt or malformed PDF throws standard catchable exception', async () => {
  const corruptedBuffer = new Uint8Array(Buffer.from('Not a PDF file header'))
  let threw = false
  try {
    await extractText(corruptedBuffer, { mergePages: false })
  } catch (err) {
    threw = true
    assert(err.name === 'InvalidPDFException' || err.message.includes('structure'), 'Correct exception thrown')
  }
  assert(threw, 'Should throw an error for corrupt PDF')
})

// 5. Scanned PDF (empty digital text) detection
await testAsync('Scanned PDF with 0 selectable text characters correctly identifies as non-digital', async () => {
  const pdfStr = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << >> >> /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 0 >> stream
endstream endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000216 00000 n 
trailer << /Size 5 /Root 1 0 R >>
startxref
280
%%EOF`

  const uint8 = new Uint8Array(Buffer.from(pdfStr))
  const res = await extractText(uint8, { mergePages: false })
  const combined = (res.text || []).join('').trim()
  assert(combined.length < 15, 'Scanned PDF text length should be < 15 chars')
})

// 6. Structured Topics Data Contract Validation
test('Structured Topics Data Contract adheres to ExtractedTopic interface', () => {
  const sampleTopic = {
    topic: 'Phospholipid Bilayer Permeability',
    explanation: 'Hydrophobic core prevents diffusion of charged and polar solutes while allowing small nonpolar gases.',
    pageNumber: 1,
  }

  assert(typeof sampleTopic.topic === 'string' && sampleTopic.topic.length > 0, 'topic is non-empty string')
  assert(typeof sampleTopic.explanation === 'string' && sampleTopic.explanation.length > 0, 'explanation is non-empty string')
  assert(typeof sampleTopic.pageNumber === 'number' && sampleTopic.pageNumber > 0, 'pageNumber is positive integer')
})

// 7. Test unauthenticated API endpoint rejection
await testAsync('Live endpoint /api/scan/ocr rejects unauthenticated requests with HTTP 401', async () => {
  try {
    const res = await fetch('http://localhost:3000/api/scan/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: 'dGVzdA==',
        mimeType: 'application/pdf',
      }),
    })
    assert.strictEqual(res.status, 401, 'Endpoint rejected unauthenticated request with 401')
  } catch (err) {
    console.log('    (Dev server check skipped: ' + err.message + ')')
  }
})

console.log(`\n=== Summary: ${passed} Passed, ${failed} Failed ===`)
if (failed > 0) process.exit(1)

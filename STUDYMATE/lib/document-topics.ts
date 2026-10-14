/**
 * StudyMate AI - Document Topic Extraction Utilities
 * Provides deterministic structural topic extraction from parsed PDF page texts,
 * associating key concepts with explanations and page numbers.
 */

export interface ExtractedTopic {
  topic: string
  explanation: string
  pageNumber?: number
}

/**
 * Deterministic structural document parser that identifies key headings,
 * chapter sections, numbered concepts, and explanations directly from PDF page text.
 * Works offline and provides reliable topic extraction even when AI provider keys are unconfigured.
 */
export function extractTopicsFromDocumentStructure(
  pageTexts: Array<{ page: number; text: string }>
): ExtractedTopic[] {
  const topics: ExtractedTopic[] = []
  const seenTopics = new Set<string>()

  for (const { page, text } of pageTexts) {
    if (!text || text.trim().length === 0) continue

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Filter out page numbers and copyright boilerplate
      if (/^(page\s*\d+|\d+)$/i.test(line)) continue
      if (/^copyright|all rights reserved/i.test(line)) continue

      // Detect headings:
      // 1. Numbered or labeled heading: "1. ...", "Chapter 1: ...", "Section 2.3: ..."
      const isNumbered =
        /^(\d+[\.\)]|\b(chapter|unit|topic|part|section)\b\s*\d*[:.-]?)/i.test(line) &&
        line.length <= 80

      // 2. Short Title Case or ALL CAPS heading
      const isTitleCaseOrCaps =
        line.length >= 4 &&
        line.length <= 60 &&
        !/[.,;]$/.test(line) &&
        (/^[A-Z0-9\s:–—-]+$/.test(line) ||
          /^[A-Z][a-z0-9]+(\s+[A-Z][a-z0-9]+)*/.test(line))

      // 3. Colon-terminated concept label
      const isColon = line.endsWith(':') && line.length <= 60

      if (isNumbered || isTitleCaseOrCaps || isColon) {
        const cleanTitle = line
          .replace(
            /^(\d+[\.\)]|\b(chapter|unit|topic|part|section)\b\s*\d*[:.-]?)\s*/i,
            ''
          )
          .replace(/[:–—-]+$/, '')
          .trim()

        const lower = cleanTitle.toLowerCase()
        if (
          cleanTitle.length < 3 ||
          cleanTitle.length > 60 ||
          lower === 'introduction' ||
          lower === 'summary' ||
          lower === 'conclusion' ||
          lower === 'contents' ||
          lower === 'table of contents' ||
          seenTopics.has(lower)
        ) {
          continue
        }

        // Collect subsequent text as pedagogical explanation
        let explanation = ''
        let j = i + 1
        while (j < lines.length && j < i + 5) {
          const nextLine = lines[j]
          if (
            /^(\d+[\.\)]|\b(chapter|unit|topic|part|section)\b)/i.test(nextLine) ||
            (nextLine.length < 50 && /^[A-Z0-9\s:–—-]+$/.test(nextLine))
          ) {
            break
          }
          explanation += (explanation ? ' ' : '') + nextLine
          if (explanation.length >= 120) break
          j++
        }

        if (!explanation || explanation.length < 15) {
          explanation = `Core academic concept discussed on page ${page} of the document.`
        } else {
          const match = explanation.match(/^.*?[.!?](?:\s|$)/)
          explanation = (match ? match[0] : explanation).slice(0, 220).trim()
        }

        seenTopics.add(lower)
        topics.push({
          topic: cleanTitle,
          explanation,
          pageNumber: page,
        })

        if (topics.length >= 6) break
      }
    }

    if (topics.length >= 6) break
  }

  // Fallback: If no explicit headings detected, extract definitional sentences
  if (topics.length === 0) {
    for (const { page, text } of pageTexts) {
      const sentences = text
        .split(/(?<=[.?!])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 25 && s.length < 180)

      for (const sentence of sentences) {
        if (
          /\b(is\s+a|are\s+the|consists\s+of|is\s+defined\s+as|refers\s+to|plays\s+a\s+(key|vital|critical)\s+role|synthesize|regulates)\b/i.test(
            sentence
          )
        ) {
          const words = sentence.split(/\s+/)
          const candidate = words.slice(0, 5).join(' ').replace(/[.,:;]$/, '')
          if (candidate.length >= 4 && !seenTopics.has(candidate.toLowerCase())) {
            seenTopics.add(candidate.toLowerCase())
            topics.push({
              topic: candidate,
              explanation: sentence,
              pageNumber: page,
            })
          }
        }
        if (topics.length >= 4) break
      }
      if (topics.length >= 4) break
    }
  }

  return topics
}

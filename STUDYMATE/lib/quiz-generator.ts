export interface QuizQuestionItem {
  question: string
  options: string[]
  answer: number
  explanation: string
  topic: string
}

export interface NoteSectionInput {
  id?: string
  title: string
  content: string
  examTip?: string
  bullets?: string[]
}

/**
 * Deterministically constructs curriculum-grounded quiz questions directly from
 * study note sections, definitions, and bullets.
 *
 * Strict Grounding Guarantee:
 * Every single option (both correct answer and distractors) is drawn directly from
 * actual statements in the user's study notes. No fake phrases, generic filler, or
 * misleading distractors are ever introduced.
 * If the notes contain fewer than 4 distinct concept statements, it returns an empty
 * array so that invalid or misleading content is never presented to the student.
 */
export function generateStructuralQuestionsFromNotes(
  sections: NoteSectionInput[],
  topic: string,
  targetCount: number,
  notesSummary?: string
): QuizQuestionItem[] {
  const cleanTopic = (topic || 'Study Topic').trim()
  const validSections = (sections || []).filter(
    (s) => s && s.title && (s.content?.trim().length > 0 || (s.bullets && s.bullets.length > 0))
  )

  interface ConceptFact {
    concept: string
    statement: string
    explanation: string
  }

  const pool: ConceptFact[] = []

  for (const sec of validSections) {
    const cleanTitle = sec.title.replace(/^notes-\w+:\s*/i, '').trim()
    const content = (sec.content || '').trim()

    // Extract all factual sentences from section content
    if (content.length >= 15) {
      const rawSentences = content
        .split(/(?<=[.?!])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 15)

      for (const sent of rawSentences) {
        const statement = sent.length > 180 ? `${sent.slice(0, 177).trim()}...` : sent
        pool.push({
          concept: cleanTitle,
          statement,
          explanation: sec.examTip ? `${statement} (Exam Tip: ${sec.examTip})` : statement,
        })
      }
    }

    // Extract bullet points if present
    if (Array.isArray(sec.bullets)) {
      for (const bullet of sec.bullets) {
        const cleanBullet = bullet.trim()
        if (cleanBullet.length >= 15) {
          const statement = cleanBullet.length > 180 ? `${cleanBullet.slice(0, 177).trim()}...` : cleanBullet
          pool.push({
            concept: cleanTitle,
            statement,
            explanation: `Key concept point for ${cleanTitle}: ${statement}`,
          })
        }
      }
    }
  }

  // Include summary sentences if available
  if (notesSummary && notesSummary.trim().length >= 25) {
    const summarySentences = notesSummary
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 15)

    for (const sent of summarySentences) {
      const statement = sent.length > 180 ? `${sent.slice(0, 177).trim()}...` : sent
      if (!pool.some((p) => p.statement === statement)) {
        pool.push({
          concept: cleanTopic,
          statement,
          explanation: statement,
        })
      }
    }
  }

  // Deduplicate statements by normalized text
  const uniquePool: ConceptFact[] = []
  const seenStatements = new Set<string>()
  for (const item of pool) {
    const key = item.statement.toLowerCase().slice(0, 50)
    if (!seenStatements.has(key)) {
      seenStatements.add(key)
      uniquePool.push(item)
    }
  }

  // CRITICAL: Minimum 4 distinct factual statements from actual notes required
  // to construct a non-misleading 4-choice question without AI synthesis.
  if (uniquePool.length < 4) {
    return []
  }

  const questions: QuizQuestionItem[] = []
  const questionsToMake = Math.min(targetCount, uniquePool.length)

  for (let i = 0; i < questionsToMake; i++) {
    const targetFact = uniquePool[i]

    // Select 3 distractors from the remaining authentic statements
    const otherFacts = uniquePool.filter((_, idx) => idx !== i)
    if (otherFacts.length < 3) break

    const optionsSet = new Set<string>([targetFact.statement])
    for (let step = 0; step < otherFacts.length; step++) {
      const candidate = otherFacts[(i + step) % otherFacts.length].statement
      if (!optionsSet.has(candidate)) {
        optionsSet.add(candidate)
        if (optionsSet.size === 4) break
      }
    }

    if (optionsSet.size < 4) {
      continue
    }

    const optionsList = Array.from(optionsSet)
    // Deterministic position (0, 1, 2, or 3) for the correct answer
    const correctIdx = (i * 2 + 1) % 4
    const actualPos = optionsList.indexOf(targetFact.statement)
    if (actualPos !== correctIdx) {
      const temp = optionsList[correctIdx]
      optionsList[correctIdx] = optionsList[actualPos]
      optionsList[actualPos] = temp
    }

    const questionStem =
      targetFact.concept !== cleanTopic
        ? `In study notes for "${cleanTopic}", which statement accurately describes ${targetFact.concept}?`
        : `According to the study notes for "${cleanTopic}", which of the following is correct?`

    questions.push({
      question: questionStem,
      options: optionsList,
      answer: correctIdx,
      explanation: targetFact.explanation,
      topic: targetFact.concept || cleanTopic,
    })

    if (questions.length >= targetCount) break
  }

  return questions
}
